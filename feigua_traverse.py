"""
飞瓜类目遍历 — 自动点击遍历飞瓜大数据声量平台的类目树。
通过 CDP 连接本地 Chrome，交互式选择一级类目后递归遍历所有末级类目。
每次点击末级类目时触发页面数据加载，后续可从接口抓取数据。
"""

import subprocess
import time
import os
import sys
from playwright.sync_api import sync_playwright

# ── 配置 ──────────────────────────────────────────────
CHROME_DEBUG_PORT = 9222
TARGET_URL = "https://www.bigdatavoice.com/app/#/data-overview/index?tab=goods"

CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
]

# ── Chrome 管理 ────────────────────────────────────────

def _find_chrome() -> str | None:
    for p in CHROME_PATHS:
        if os.path.exists(p):
            return p
    # 尝试通过注册表查找
    try:
        result = subprocess.run(
            ['reg', 'query', r'HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe',
             '/ve'], capture_output=True, text=True, timeout=5)
        for line in result.stdout.splitlines():
            line = line.strip()
            if line.endswith('.exe') and os.path.exists(line):
                return line
    except Exception:
        pass
    return None


def _kill_chrome():
    """关闭所有 Chrome 进程，确保下次启动时调试端口生效。"""
    print("🔧 正在关闭现有 Chrome 进程...")
    subprocess.run(['taskkill', '/F', '/IM', 'chrome.exe'],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(2)


def _launch_chrome_with_debug():
    chrome = _find_chrome()
    if not chrome:
        print("❌ 未找到 Chrome 安装路径，请确认 Chrome 已安装")
        sys.exit(1)

    # 先杀掉已有 Chrome（否则 --remote-debugging-port 不生效）
    _kill_chrome()

    print(f"🚀 启动 Chrome（调试端口 {CHROME_DEBUG_PORT}）...")
    subprocess.Popen(
        [chrome, f"--remote-debugging-port={CHROME_DEBUG_PORT}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if hasattr(subprocess, 'CREATE_NO_WINDOW') else 0,
    )
    # Chrome 启动需要时间，等待后重试连接
    for i in range(8):
        time.sleep(1)
        try:
            from urllib.request import urlopen
            urlopen(f"http://localhost:{CHROME_DEBUG_PORT}/json/version", timeout=2)
            return
        except Exception:
            pass
    print("⚠ Chrome 启动较慢，但会继续尝试连接...")


def connect_browser(p):
    """连接已打开的 Chrome，若未打开则自动启动并重新连接。"""
    for attempt in range(3):
        try:
            browser = p.chromium.connect_over_cdp(f"http://localhost:{CHROME_DEBUG_PORT}")
            print("✅ 已连接到 Chrome")
            return browser
        except Exception:
            if attempt == 0:
                print("⚠ 未检测到 Chrome 调试端口，正在启动...")
                _launch_chrome_with_debug()
            else:
                time.sleep(2)

    print("❌ 无法连接 Chrome 调试端口。请手动尝试以下步骤：")
    print("   1. 关闭所有 Chrome 窗口")
    print(f'   2. 在运行中输入: chrome.exe --remote-debugging-port={CHROME_DEBUG_PORT}')
    print("   3. 重新运行本脚本")
    sys.exit(1)


# ── 级联选择器操作 ─────────────────────────────────────

def _cascader_is_open(page) -> bool:
    """检查级联选择器面板是否已展开。"""
    menus = page.locator('div[role="menu"][id*="cascader-menu-"]')
    return menus.count() > 0


def open_cascader(page):
    """点击触发区域展开级联选择器。"""
    if _cascader_is_open(page):
        return
    # 优先用 Element UI 通用的 cascader input 定位
    trigger = page.locator(".el-cascader input").first
    if trigger.count() == 0:
        trigger = page.locator(".el-cascader .el-input__inner").first
    if trigger.count() == 0:
        # 最后的 fallback
        trigger = page.locator("input[placeholder]").first
    if trigger.count() > 0:
        trigger.click()
        time.sleep(0.8)


def close_cascader(page):
    """点击页面空白处关闭级联菜单。"""
    page.locator("body").click(position={"x": 0, "y": 0})
    time.sleep(0.3)


def _menu_locator(page, menu_index: int):
    """获取第 menu_index 层（0-based）的菜单容器。"""
    return page.locator(f'xpath=(//div[@role="menu"][contains(@id,"cascader-menu-")])[{menu_index + 1}]')


def _node_locator(page, menu_index: int, name: str):
    """在指定层级菜单中定位指定名称的 li 节点。"""
    menu = _menu_locator(page, menu_index)
    return menu.locator(f"xpath=.//li[.//span[text()='{name}']]")


def hover_path(page, path: list[str]):
    """从根开始逐级悬停，展开到 path 所指向的菜单层级。"""
    for i, name in enumerate(path):
        node = _node_locator(page, i, name)
        if node.count() > 0:
            node.scroll_into_view_if_needed()
            node.hover()
            # dispatchEvent 确保 Element UI 识别到 mouseenter
            node.dispatch_event("mouseenter")
            time.sleep(0.6)


def click_node(page, menu_index: int, name: str):
    """在指定层级菜单中点击目标节点。"""
    node = _node_locator(page, menu_index, name)
    if node.count() == 0:
        print(f"  ⚠ 未找到节点 [{menu_index}]{name}")
        return False
    node.scroll_into_view_if_needed()
    time.sleep(0.2)
    node.click()
    time.sleep(1.0)
    return True


def node_has_arrow(page, menu_index: int, name: str) -> bool:
    """检查指定节点右侧是否有向右箭头（表示有子类目）。"""
    node = _node_locator(page, menu_index, name)
    if node.count() == 0:
        return False
    arrow = node.locator(".el-icon-arrow-right, [class*='arrow-right'], .el-cascader-node__postfix")
    return arrow.count() > 0


def get_menu_items(page, menu_index: int) -> list[str]:
    """获取指定层级菜单中所有可见的类目名称。"""
    menu = _menu_locator(page, menu_index)
    if menu.count() == 0:
        return []
    items = menu.locator("xpath=.//li//span").all_text_contents()
    return [s.strip() for s in items if s.strip()]


# ── 递归遍历 ──────────────────────────────────────────

def traverse(page, path: list[str]):
    """
    递归遍历一个类目节点。
    path: 从一级类目到当前目标的完整路径，如 ["美妆护肤", "面膜", "补水面膜"]
    """
    target = path[-1]
    target_depth = len(path) - 1

    # ── 第一步：点击选中当前目标（菜单自动收起）──
    open_cascader(page)
    hover_path(page, path[:-1])          # 悬停展开所有父级
    ok = click_node(page, target_depth, target)
    if not ok:
        close_cascader(page)
        return
    print(f"  点击: {' > '.join(path)}")

    # ── 第二步：重新打开菜单，检查当前目标是否有子级 ──
    open_cascader(page)
    hover_path(page, path)               # 悬停到当前节点，触发子菜单出现
    has_child = node_has_arrow(page, target_depth, target)

    if has_child:
        children = get_menu_items(page, target_depth + 1)
        if children:
            for child in children:
                traverse(page, path + [child])
        else:
            print(f"  ⚠ 类目 '{target}' 显示有箭头但未获取到子项")
    else:
        print(f"  ✅ 末级: {' > '.join(path)}")

    close_cascader(page)


# ── 一级类目获取 ───────────────────────────────────────

def get_top_categories(page) -> list[str]:
    """展开级联选择器，获取一级类目列表。"""
    open_cascader(page)
    items = get_menu_items(page, 0)
    close_cascader(page)
    return items


# ── 主流程 ────────────────────────────────────────────

def main():
    print("=" * 50)
    print("  飞瓜类目遍历工具")
    print("=" * 50)

    with sync_playwright() as p:
        browser = connect_browser(p)

        # 打开目标页面
        context = browser.contexts[0]
        page = context.new_page()
        print(f"📄 打开页面: {TARGET_URL}")
        page.goto(TARGET_URL, wait_until="domcontentloaded")
        print("⏳ 等待页面渲染...")
        time.sleep(5)

        # 获取一级类目
        print("📋 获取一级类目列表...")
        categories = get_top_categories(page)

        if not categories:
            print("❌ 未能获取类目列表，请确认：")
            print("   1. 浏览器中已登录 bigdatavoice.com")
            print("   2. 页面中的数据概览页已完整加载")
            input("\n按 Enter 退出...")
            return

        print(f"\n一级类目（共 {len(categories)} 个）:")
        for i, cat in enumerate(categories, 1):
            print(f"  {i:2d}. {cat}")

        # 交互式选择
        choice = input("\n请输入要遍历的类目编号（多个用逗号分隔，输入 all 遍历全部）: ").strip()

        if choice.lower() == "all":
            selected = categories
        else:
            try:
                indices = [int(x.strip()) - 1 for x in choice.split(",")]
                selected = [categories[i] for i in indices if 0 <= i < len(categories)]
            except ValueError:
                print("❌ 输入格式错误")
                return

        if not selected:
            print("❌ 未选择任何类目")
            return

        print(f"\n🚀 开始遍历 {len(selected)} 个一级类目...\n")
        for cat in selected:
            print(f"📂 {cat}")
            traverse(page, [cat])
            print()

        print("🎉 全部遍历完成！")

    input("\n按 Enter 退出...")


if __name__ == "__main__":
    main()
