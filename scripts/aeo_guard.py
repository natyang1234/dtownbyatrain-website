#!/usr/bin/env python3
"""AEO 護欄：改版前後比對「內容」必須完全一致（2026-09-30 獎項級改版用）。

nat 規則：不為評審刪 SEO／GEO／AIO 設計——AEO 文字逐字不動、不收合、不搬走、
標題層級與錨點 id 不變。本腳本把這條規則變成可執行的檢查：

  python3 scripts/aeo_guard.py snapshot   # 建立基線（只在改版開始前跑一次）
  python3 scripts/aeo_guard.py check      # 每次上線前跑；非 0 結束＝不准上線

檢查項目（中英兩頁）：
  1. 每個 <section id>（及 <div id=menu>）的文字（textContent，正規化空白）逐字相同
     —— 新增的裝飾性文字要放在 [data-aeo-ignore] 元素內才會被排除
  2. 所有 h1–h6 的（層級, 文字）清單完全相同
  3. 基線中的每個 id 都還在（可以新增，不能少）
  4. JSON-LD 內容相同（忽略 dateModified）
  5. 瀏覽器實測（桌機＋手機、初始未捲動）：各 section 內「有文字卻被隱藏」的元素數
     不得比基線多（display:none／visibility:hidden／opacity:0／clip-path 裁到 50%、100%；已關閉的 <details> 內容不算）
"""
import json, re, subprocess, sys, time, socket
from pathlib import Path

from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent.parent
PAGES = ["index.html", "en/index.html"]
BASELINE = ROOT / "scripts" / "aeo_baseline.json"
IGNORE_SCHEMA_KEYS = {"dateModified"}


def norm(t):
    return re.sub(r"\s+", " ", t or "").strip()


def strip_keys(o):
    if isinstance(o, dict):
        return {k: strip_keys(v) for k, v in o.items() if k not in IGNORE_SCHEMA_KEYS}
    if isinstance(o, list):
        return [strip_keys(v) for v in o]
    return o


def static_snapshot(path):
    soup = BeautifulSoup((ROOT / path).read_text(encoding="utf-8"), "html.parser")
    schema = []
    for s in soup.find_all("script", type="application/ld+json"):
        schema.append(strip_keys(json.loads(s.string or s.get_text())))
    for t in soup(["script", "style", "noscript", "template"]):
        t.decompose()
    for t in soup.select("[data-aeo-ignore]"):
        t.decompose()
    sections = {}
    for sec in soup.find_all("section", id=True) + soup.select("div#menu"):
        sections[sec["id"]] = norm(sec.get_text(" "))
    headings = [[h.name, norm(h.get_text(" "))] for h in soup.find_all(re.compile(r"^h[1-6]$"))]
    ids = sorted({e["id"] for e in soup.find_all(id=True)})
    return {"sections": sections, "headings": headings, "ids": ids, "schema": schema}


HIDDEN_JS = r"""
() => {
  const out = {};
  const hiddenBy = el => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      if (e.tagName === 'DETAILS' && !e.open && el !== e && !e.querySelector(':scope > summary')?.contains(el)) return null;
      const cs = getComputedStyle(e);
      if (cs.display === 'none') return 'display';
      if (cs.visibility === 'hidden') return 'visibility';
      if (parseFloat(cs.opacity) === 0) return 'opacity';
      if (/inset\((?:[^)]*\b(?:50|100)%)/.test(cs.clipPath.split(' round')[0])) return 'clip-path';
    }
    return '';
  };
  for (const sec of document.querySelectorAll('section[id], div#menu')) {
    let n = 0;
    for (const el of [sec, ...sec.querySelectorAll('*')]) {
      if (el.closest('[data-aeo-ignore]') || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(el.tagName)) continue;
      // 只算「自己直接含有文字」的元素（不依賴標籤名稱，div／span 內的文字也涵蓋）
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const r = hiddenBy(el);
      if (r) n++;
    }
    out[sec.id] = n;
  }
  return out;
}
"""


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def visibility_snapshot():
    from playwright.sync_api import sync_playwright
    port = free_port()
    srv = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1"],
                           cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        time.sleep(0.8)
        res = {}
        with sync_playwright() as pw:
            b = pw.chromium.launch()
            for vp_name, vp in (("desktop", (1440, 900)), ("mobile", (390, 844))):
                ctx = b.new_context(viewport={"width": vp[0], "height": vp[1]})
                page = ctx.new_page()
                for path in PAGES:
                    url = f"http://127.0.0.1:{port}/{path.replace('index.html', '')}"
                    page.goto(url, wait_until="load")
                    page.wait_for_timeout(1200)
                    res[f"{vp_name}:{path}"] = page.evaluate(HIDDEN_JS)
                ctx.close()
            b.close()
        return res
    finally:
        srv.terminate()


def snapshot():
    data = {"static": {p: static_snapshot(p) for p in PAGES}, "hidden": visibility_snapshot()}
    BASELINE.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"基線已建立：{BASELINE.relative_to(ROOT)}")


def check(skip_browser=False):
    base = json.loads(BASELINE.read_text(encoding="utf-8"))
    errs, warns = [], []
    for p in PAGES:
        cur, old = static_snapshot(p), base["static"][p]
        for sid, txt in old["sections"].items():
            if sid not in cur["sections"]:
                errs.append(f"{p} #{sid}：section 不見了")
            elif cur["sections"][sid] != txt:
                a, b = txt, cur["sections"][sid]
                i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
                errs.append(f"{p} #{sid}：文字不同（第 {i} 字附近）\n    舊：…{a[max(0,i-30):i+50]}…\n    新：…{b[max(0,i-30):i+50]}…")
        for sid in set(cur["sections"]) - set(old["sections"]):
            warns.append(f"{p} 新增 section #{sid}（請確認不是把 AEO 內容搬家）")
        if cur["headings"] != old["headings"]:
            oh, nh = [tuple(x) for x in old["headings"]], [tuple(x) for x in cur["headings"]]
            errs.append(f"{p} 標題清單變了：少了 {[h for h in oh if h not in nh][:5]}，多了 {[h for h in nh if h not in oh][:5]}")
        missing = set(old["ids"]) - set(cur["ids"])
        if missing:
            errs.append(f"{p} 少了 id：{sorted(missing)[:10]}")
        if cur["schema"] != old["schema"]:
            errs.append(f"{p} JSON-LD 內容變了（dateModified 以外）")
    if not skip_browser:
        cur_h = visibility_snapshot()
        for k, secs in base["hidden"].items():
            for sid, n in secs.items():
                m = cur_h.get(k, {}).get(sid)
                if m is not None and m > n:
                    errs.append(f"{k} #{sid}：初始被隱藏的文字元素 {n}→{m}（動畫不得延遲 AEO 文字）")
    for w in warns:
        print("⚠️ ", w)
    if errs:
        print(f"❌ AEO 護欄失敗 {len(errs)} 項：")
        for e in errs:
            print("  -", e)
        sys.exit(1)
    print("✅ AEO 護欄通過：文字、標題、id、JSON-LD、初始可見性皆與基線一致")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "check"
    if cmd == "snapshot":
        snapshot()
    elif cmd == "check":
        check(skip_browser="--static" in sys.argv)
    else:
        print(__doc__); sys.exit(2)
