(function () {
  // 版本号：改动代码后升级此值可强制重新初始化
  const VERSION = 4;
  if (window.__feigua_version >= VERSION) return;
  window.__feigua_version = VERSION;

  // ── 基础工具 ──

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
  async function sleepOrStop(ms) {
    const steps = Math.ceil(ms / 100);
    for (let i = 0; i < steps; i++) {
      await sleep(Math.min(100, ms - i * 100));
      if (window.__feigua_stop) throw new Error('STOP');
    }
  }
  function log(...args) { console.log('[飞瓜]', ...args); }
  function checkStop() { if (window.__feigua_stop) throw new Error('STOP'); }

  // ── 拦截器已在 interceptor.js (MAIN world) 中注入 ──
  // 数据通过 DOM <div id="__feigua_data"> 共享

  // ── 级联选择器 ──

  function getTrigger() {
    let t = document.querySelector('.el-cascader input');
    if (t) return t;
    t = document.querySelector('.el-cascader .el-input__inner');
    if (t) return t;
    t = document.querySelector('.el-cascader');
    if (t) return t;
    const xpath = '/html/body/div[1]/div/div[6]/div[2]/div/div/div[2]/div/div/div[1]/div/div[1]/div[2]/div[1]/div/div[1]/div/div[2]/span/span/div/div/div';
    t = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    if (t) return t;
    for (const inp of document.querySelectorAll('input:not([type="hidden"])')) {
      if (inp.offsetParent !== null) return inp;
    }
    return null;
  }

  function cascaderOpen() {
    return document.querySelectorAll('div[role="menu"][id*="cascader-menu-"]').length > 0;
  }

  async function openCascader() {
    checkStop();
    if (cascaderOpen()) return;
    const t = getTrigger();
    if (!t) { log('❌ 无触发元素'); return; }
    t.click();
    await sleepOrStop(800);
  }

  async function closeCascader() {
    if (cascaderOpen()) document.body.click();
    await sleepOrStop(300);
  }

  function getMenus() {
    return document.querySelectorAll('div[role="menu"][id*="cascader-menu-"]');
  }

  function getNodeLabel(li) {
    const label = li.querySelector('.el-cascader-node__label');
    if (label) return label.textContent.trim();
    for (const span of li.querySelectorAll('span')) {
      const t = span.textContent.trim(); if (t) return t;
    }
    return '';
  }

  function getMenuItems(menuIndex) {
    const m = getMenus()[menuIndex];
    if (!m) return [];
    return [...m.querySelectorAll('li')].map(getNodeLabel).filter(Boolean);
  }

  function findNode(menuIndex, name) {
    const m = getMenus()[menuIndex];
    if (!m) return null;
    for (const li of m.querySelectorAll('li')) {
      if (getNodeLabel(li) === name) return li;
    }
    return null;
  }

  function hasArrow(node) {
    if (!node) return false;
    return !!node.querySelector('.el-icon-arrow-right, [class*="arrow-right"], .el-cascader-node__postfix');
  }

  async function hoverNode(node) {
    checkStop();
    if (!node) return;
    node.scrollIntoView({ block: 'nearest' });
    node.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await sleepOrStop(600);
  }

  // ── 面板 ──

  let panelMinimized = false;

  function createPanel() {
    const div = document.createElement('div');
    div.id = '__feigua_panel';
    div.innerHTML = `
      <div id="__fg_panel_outer" style="
        position:fixed;top:16px;right:16px;z-index:99999;
        background:#FFFFFF;border:1px solid #F0E6E8;
        border-radius:14px;box-shadow:0 4px 24px rgba(0,0,0,.08), 0 1px 4px rgba(0,0,0,.04);
        font-family:'PingFang SC','Microsoft YaHei',sans-serif;font-size:13px;
        min-width:210px;
      ">
        <div id="__fg_header" style="
          display:flex;align-items:center;justify-content:space-between;
          padding:10px 14px;cursor:pointer;user-select:none;
          border-bottom:1px solid #F5EEF0;
        ">
          <span style="font-weight:700;color:#2D2426;font-size:13px;letter-spacing:0.5px;">🍉 飞瓜大盘数据采集</span>
          <span id="__fg_min_btn" style="font-size:14px;line-height:1;color:#C8B4B8;padding:2px 6px;border-radius:4px;transition:all .2s;">−</span>
        </div>
        <div id="__fg_body" style="padding:12px 14px;max-height:360px;overflow-y:auto;">
          <div id="__fg_status" style="color:#A8989C;font-size:12px;">请选择保存位置...</div>
          <button id="__fg_pick_folder" style="margin-top:8px;padding:6px 14px;font-size:12px;font-weight:600;cursor:pointer;background:linear-gradient(135deg,#2DD4A8,#1DA87A);color:#fff;border:none;border-radius:8px;letter-spacing:.5px;box-shadow:0 2px 10px rgba(45,212,168,.2);transition:all .2s;">📁 选择保存位置</button>
          <div id="__fg_traverse_ui" style="display:none;">
            <div id="__fg_progress" style="margin-top:6px;color:#FF3860;font-size:12px;font-weight:500;"></div>
            <div style="margin-top:8px;display:flex;gap:6px;">
              <button id="__fg_stop" style="padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;background:#FFF0F3;color:#FF3860;border:1px solid #FFD6DD;border-radius:8px;letter-spacing:.5px;transition:all .2s;">停止</button>
              <button id="__fg_reset" style="padding:4px 12px;font-size:11px;font-weight:600;cursor:pointer;background:#F8F5F6;color:#A8989C;border:1px solid #F0E6E8;border-radius:8px;transition:all .2s;">重置</button>
            </div>
            <div id="__fg_leaf" style="margin-top:8px;max-height:170px;overflow-y:auto;font-size:11px;color:#8A7C80;line-height:1.8;font-family:'SF Mono','PingFang SC',monospace;"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);

    document.getElementById('__fg_header').onclick = () => {
      panelMinimized = !panelMinimized;
      const body = document.getElementById('__fg_body');
      const btn = document.getElementById('__fg_min_btn');
      if (panelMinimized) { body.style.display = 'none'; btn.textContent = '+'; }
      else { body.style.display = ''; btn.textContent = '−'; }
    };

    document.getElementById('__fg_stop').onclick = () => {
      window.__feigua_stop = true;
      updateStatus('⏸ 正在停止...');
    };

    document.getElementById('__fg_reset').onclick = () => {
      window.__feigua_stop = true;
      destroyPanel();
    };
  }

  function destroyPanel() {
    const p = document.getElementById('__feigua_panel');
    if (p) p.remove();
  }

  function updateStatus(text) { const el = document.getElementById('__fg_status'); if (el) el.textContent = text; }
  function updateProgress(text) { const el = document.getElementById('__fg_progress'); if (el) el.textContent = text; }

  function appendLeaf(text) {
    const el = document.getElementById('__fg_leaf');
    if (!el) return;
    while (el.children.length >= 50) el.firstChild.remove();
    const d = document.createElement('div');
    d.textContent = '✅ ' + text;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
  }

  // ── CSV 生成（大数据量稳定，无第三方依赖）──

  const CSV_HEADER = '﻿类目名称,日期,销售额,销量,视频销售额,视频销量,直播销售额,直播销量,浏览量';

  function csvEscape(val) {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function rowsToCsv(dataRows) {
    const lines = [CSV_HEADER];
    for (const row of dataRows) {
      lines.push(row.map(csvEscape).join(','));
    }
    return lines.join('\n');
  }

  async function writeCsv(dirHandle, dataRows) {
    try {
      const fileHandle = await dirHandle.getFileHandle(csvFilename + '.csv', { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(rowsToCsv(dataRows));
      await writable.close();
      return true;
    } catch (e) {
      log('❌ 写文件失败:', e.message);
      return false;
    }
  }

  // ── 接口捕获 ──

  function readCapturedData() {
    const div = document.getElementById('__feigua_data');
    if (!div || !div.dataset.body) return null;
    const time = parseInt(div.dataset.time) || 0;
    if (time < window.__feigua_capture_time) return null;
    try {
      const data = JSON.parse(div.dataset.body);
      if (data.Data && Array.isArray(data.Data)) return data.Data;
    } catch (_) {}
    return null;
  }

  function markCaptureTime() {
    window.__feigua_capture_time = Date.now();
    // 清空上次数据
    const div = document.getElementById('__feigua_data');
    if (div) { div.dataset.body = ''; div.dataset.time = '0'; }
  }

  async function waitForSalesTrendData(maxWait) {
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      checkStop();
      const data = readCapturedData();
      if (data) return data;
      await sleepOrStop(500);
    }
    return null;
  }

  function parseDataRows(categoryPath, dataArray) {
    if (!dataArray) return [];
    const cut = v => Math.floor((v || 0) / 100);  // 去掉后两位，不四舍五入
    return dataArray.map(item => [
      categoryPath,
      item.ListTimeStr || '',
      cut(item.TotalSales),
      item.SumSalesCount || 0,
      cut(item.AwemeSales),
      item.AwemeSalesCount || 0,
      cut(item.LiveSales),
      item.LiveSalesCount || 0,
      item.PV || 0
    ]);
  }

  // ── 遍历 ──

  let leafCount = 0;
  let allDataRows = [];    // 累积所有数据行
  let dirHandle = null;    // 文件系统目录句柄
  let csvFilename = '飞瓜数据';  // 自定义文件名

  async function traverse(path) {
    checkStop();

    const target = path[path.length - 1];
    const depth = path.length - 1;
    const pathStr = path.join(' > ');

    log('── 进入:', pathStr, 'depth:', depth, '──');

    await openCascader();

    for (let i = 0; i < depth; i++) {
      checkStop();
      const parentNode = findNode(i, path[i]);
      if (parentNode) {
        await hoverNode(parentNode);
      } else {
        log('⚠ 未找到父节点:', path[i], 'level:', i);
        await closeCascader();
        return;
      }
    }

    const targetNode = findNode(depth, target);
    if (!targetNode) {
      log('❌ 未找到目标节点:', target, 'depth:', depth);
      await closeCascader();
      return;
    }

    if (hasArrow(targetNode)) {
      await hoverNode(targetNode);
      await sleepOrStop(300);

      const children = getMenuItems(depth + 1);
      log('  非末级, 子类目:', children.length, '个');
      if (children.length > 0) {
        for (let i = 0; i < children.length; i++) {
          checkStop();
          updateProgress(pathStr + ` (${i + 1}/${children.length})`);
          await traverse([...path, children[i]]);
        }
      } else {
        log('⚠ 有箭头但无子项:', target);
      }
      await closeCascader();
    } else {
      // ── 末级：标记捕获时间 → 点击 → 等接口 → 写入 CSV → 停 3 秒 ──
      markCaptureTime();

      leafCount++;
      appendLeaf(leafCount + '. ' + pathStr);
      updateStatus('点击: ' + pathStr);
      log('✅ 点击末级:', pathStr);

      const label = targetNode.querySelector('.el-cascader-node__label');
      const clickEl = label || targetNode;
      clickEl.scrollIntoView({ block: 'nearest' });
      await sleepOrStop(200);
      clickEl.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      clickEl.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      clickEl.click();

      // 等待 salesTrendData 接口（最多 20 秒）
      updateStatus('等待接口: ' + pathStr);
      const data = await waitForSalesTrendData(20000);
      if (data && data.length > 0) {
        const rows = parseDataRows(pathStr, data);
        allDataRows.push(...rows);
        updateStatus(`✅ ${pathStr} (${data.length} 天, 累计 ${allDataRows.length} 行)`);
        log('📊 捕获', data.length, '天数据, 累计', allDataRows.length, '行');

        // 实时写入 CSV
        if (dirHandle) {
          updateStatus('💾 写入文件...');
          await writeCsv(dirHandle, allDataRows);
          updateStatus(`✅ ${pathStr} (${data.length} 天, 累计 ${allDataRows.length} 行)`);
        }
      } else {
        log('⚠ 未捕获到 salesTrendData 响应');
        updateStatus('⚠ 未捕获数据: ' + pathStr);
      }

      // 防风控：随机等待 3~5 秒
      const waitMs = 3000 + Math.floor(Math.random() * 2000);
      updateStatus('⏳ 等待 ' + (waitMs / 1000).toFixed(1) + ' 秒...');
      await sleepOrStop(waitMs);
    }
  }

  async function startTraversal(paths, fn) {
    destroyPanel();
    createPanel();

    leafCount = 0;
    allDataRows = [];
    csvFilename = fn || '飞瓜数据';
    window.__feigua_stop = false;

    // ── 第一步：选择保存位置 ──
    document.getElementById('__fg_pick_folder').onclick = async () => {
      try {
        dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        // 申请持久化写入权限，避免后续写入时要求用户激活
        if (dirHandle.requestPermission) {
          await dirHandle.requestPermission({ mode: 'readwrite' });
        }
        updateStatus('📁 已选择: ' + dirHandle.name);
        document.getElementById('__fg_pick_folder').style.display = 'none';
        document.getElementById('__fg_traverse_ui').style.display = '';
        // 选择完自动开始遍历
        doTraverse();
      } catch (e) {
        if (e.name === 'AbortError') {
          updateStatus('⚠ 未选择文件夹，请重试');
        } else {
          updateStatus('❌ 错误: ' + e.message);
        }
      }
    };

    async function doTraverse() {
      // ── 开始遍历 ──
      try {
        for (let i = 0; i < paths.length; i++) {
          checkStop();
          updateStatus(`📂 ${paths[i].join(' > ')} (${i + 1}/${paths.length})`);
          await traverse(paths[i]);
        }
        // 最终写入
        if (dirHandle) await writeCsv(dirHandle, allDataRows);
        updateStatus('🎉 遍历完成！共 ' + leafCount + ' 个末级, ' + allDataRows.length + ' 行数据');
      } catch (e) {
        if (e.message === 'STOP') {
          // 停止时也保存已采集数据
          if (dirHandle && allDataRows.length > 0) {
            updateStatus('💾 正在保存...');
            await writeCsv(dirHandle, allDataRows);
          }
          updateStatus('⏸ 已停止, 共 ' + leafCount + ' 个末级, ' + allDataRows.length + ' 行数据');
        } else {
          throw e;
        }
      }

      log('🏁 遍历结束');
    }
  }

  // ── 消息 ──

  // 移除旧监听器，防止重复注册
  if (window.__feigua_msg_handler) {
    chrome.runtime.onMessage.removeListener(window.__feigua_msg_handler);
  }
  window.__feigua_msg_handler = (req, sender, sendResponse) => {
    if (req.type === 'startTraversal') {
      startTraversal(req.paths, req.filename);
      sendResponse({ ok: true });
      return true;
    }
  };
  chrome.runtime.onMessage.addListener(window.__feigua_msg_handler);

  log('✅ 扩展已就绪');
})();
