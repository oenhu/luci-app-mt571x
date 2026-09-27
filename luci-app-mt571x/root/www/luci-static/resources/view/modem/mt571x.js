'use strict';
'require view';
'require dom';
'require poll';
'require rpc';
'require ui';

/* RPC API definitions */
var callStatus = rpc.declare({
	object: 'mt571x',
	method: 'status'
});

var callCapabilities = rpc.declare({
	object: 'mt571x',
	method: 'capabilities'
});

var callNeighbors = rpc.declare({
	object: 'mt571x',
	method: 'neighbors'
});

var callLockNrBand = rpc.declare({
	object: 'mt571x',
	method: 'lock_nr_band',
	params: ['bands']
});

var callLockNrCell = rpc.declare({
	object: 'mt571x',
	method: 'lock_nr_cell',
	params: ['band', 'arfcn', 'scs', 'pci']
});

var callLockNrFreq = rpc.declare({
	object: 'mt571x',
	method: 'lock_nr_freq',
	params: ['band', 'arfcn']
});

var callUnlockNr = rpc.declare({
	object: 'mt571x',
	method: 'unlock_nr'
});

var callLockLteBand = rpc.declare({
	object: 'mt571x',
	method: 'lock_lte_band',
	params: ['bands']
});

var callLockLteCell = rpc.declare({
	object: 'mt571x',
	method: 'lock_lte_cell',
	params: ['band', 'earfcn', 'pci']
});

var callLockLteFreq = rpc.declare({
	object: 'mt571x',
	method: 'lock_lte_freq',
	params: ['band', 'earfcn']
});

var callUnlockLte = rpc.declare({
	object: 'mt571x',
	method: 'unlock_lte'
});

var callUnlockAll = rpc.declare({
	object: 'mt571x',
	method: 'unlock_all'
});

var callRestoreAutoMode = rpc.declare({
	object: 'mt571x',
	method: 'restore_auto_mode'
});

var callSetNetworkMode = rpc.declare({
	object: 'mt571x',
	method: 'set_network_mode',
	params: ['mode', 'lte_mask']
});

var callRebootModem = rpc.declare({
	object: 'mt571x',
	method: 'reboot_modem'
});

var callSendAt = rpc.declare({
	object: 'mt571x',
	method: 'send_at',
	params: ['cmd']
});

var callSmsList = rpc.declare({
	object: 'mt571x',
	method: 'sms_list'
});

var callSmsRecv = rpc.declare({
	object: 'mt571x',
	method: 'sms_recv'
});

var callSmsDelete = rpc.declare({
	object: 'mt571x',
	method: 'sms_delete',
	params: ['id', 'index']
});

var callSmsClearAll = rpc.declare({
	object: 'mt571x',
	method: 'sms_clear_all'
});

return view.extend({
	pollInterval: 5,
	lastStatus: null,
	activeTab: 'tab_nr',

	load: function() {
		return Promise.all([
			callCapabilities(),
			callStatus()
		]);
	},

	renderSignalBar: function(label, value, unit, min, max, warnThreshold, goodThreshold) {
		var num = parseFloat(value);
		var pct = 0;
		var color = '#999';

		if (!isNaN(num)) {
			pct = Math.min(100, Math.max(0, ((num - min) / (max - min)) * 100));
			if (num >= goodThreshold) {
				color = '#2ecc71'; // Green
			} else if (num >= warnThreshold) {
				color = '#f39c12'; // Yellow/Orange
			} else {
				color = '#e74c3c'; // Red
			}
		}

		return E('div', { 'style': 'margin-bottom: 8px;' }, [
			E('div', { 'style': 'display: flex; justify-content: space-between; font-size: 0.9em; margin-bottom: 2px;' }, [
				E('strong', {}, label),
				E('span', { 'style': 'font-weight: bold; color: ' + color }, isNaN(num) ? '--' : (num + ' ' + unit))
			]),
			E('div', { 'style': 'background: #e0e0e0; border-radius: 4px; height: 8px; overflow: hidden;' }, [
				E('div', { 'style': 'width: ' + pct + '%; background: ' + color + '; height: 100%; transition: width 0.3s;' })
			])
		]);
	},

	render: function(data) {
		var caps = data[0] || {};
		var initStatus = data[1] || {};
		var self = this;

		this.lastStatus = initStatus;

		var viewRoot = E('div', { 'class': 'cbi-map' }, [
			E('h2', { 'name': 'content' }, _('MT5710 / MT5711 5G/4G 锁频与 AT 控制')),
			E('div', { 'class': 'cbi-map-descr' }, _('面向 TD Tech 鼎桥 MT5710/MT5711（海思 Balong 基带）的高性能轻量控制套件。支持 5G/4G 频段与小区锁定、信号监测、邻区识别与实时 AT 交互。'))
		]);

		// Top Action Toolbar
		var toolbar = E('div', {
			'style': 'display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; margin-bottom: 16px; padding: 10px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 6px;'
		}, [
			E('div', { 'style': 'display: flex; gap: 8px; align-items: center;' }, [
				E('span', { 'id': 'status_badge', 'class': 'badge', 'style': 'font-size: 13px; padding: 5px 10px; border-radius: 4px; background: #2ecc71; color: #fff;' }, _('检查中...')),
				E('span', { 'id': 'port_label', 'style': 'font-size: 12px; color: #666;' }, '')
			]),
			E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 6px;' }, [
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function(ev) {
						self.refreshAll(ev.target);
					}
				}, _('立即刷新')),
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function() {
						if (!confirm(_('确定解除所有 5G 与 4G 的频段和小区锁定？（不改变网络制式）'))) return;
						ui.showModal(_('正在解除锁定...'), [E('p', { 'class': 'spinning' }, _('正在发送 AT 解锁指令...'))]);
						callUnlockAll().then(function(res) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, res.message || _('解锁指令已执行')), 'info');
							self.refreshAll();
						}).catch(function(e) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, e.message), 'error');
						});
					}
				}, _('一键解锁 (Unlock All)')),
				E('button', {
					'class': 'btn cbi-button-reset',
					'click': function() {
						if (!confirm(_('确定恢复出厂网络模式？这将清除所有锁频并将制式恢复为 5G+LTE 自动全频段搜索。'))) return;
						ui.showModal(_('正在恢复出厂设置...'), [E('p', { 'class': 'spinning' }, _('正在重设全频段掩码...'))]);
						callRestoreAutoMode().then(function(res) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, res.message || _('出厂设置已恢复')), 'info');
							self.refreshAll();
						}).catch(function(e) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, e.message), 'error');
						});
					}
				}, _('恢复自动出厂模式')),
				E('button', {
					'class': 'btn cbi-button-negative',
					'click': function() {
						if (!confirm(_('确定重启蜂窝模组协议栈 (AT+CFUN=1,1)？模组将短暂断开并重新注册网络。'))) return;
						callRebootModem().then(function(res) {
							ui.addNotification(null, E('p', {}, res.message || _('模组正在软重启...')), 'warning');
							document.getElementById('status_badge').textContent = _('模组重启中...');
							document.getElementById('status_badge').style.background = '#e67e22';
						});
					}
				}, _('软重启模组 (CFUN)'))
			])
		]);
		viewRoot.appendChild(toolbar);

		// Status Cards Container (Grid)
		var grid = E('div', {
			'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 14px; margin-bottom: 20px;'
		});

		// Card 1: Network & Identity
		var cardIdent = E('div', { 'class': 'cbi-section', 'style': 'margin-bottom: 0;' }, [
			E('h3', {}, _('网络与模组信息')),
			E('table', { 'class': 'table', 'style': 'width: 100%; margin-bottom: 0;' }, [
				E('tr', {}, [E('td', { 'style': 'width: 35%; color: #666;' }, _('模组型号:')), E('td', { 'id': 'val_model' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('网络制式:')), E('td', { 'id': 'val_rat', 'style': 'font-weight: bold; color: #2980b9;' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('运营商:')), E('td', { 'id': 'val_operator', 'style': 'font-weight: bold;' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('当前频段:')), E('td', { 'id': 'val_band', 'style': 'font-weight: bold; color: #27ae60;' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('芯片温度:')), E('td', { 'id': 'val_temp' }, '--')])
			])
		]);
		grid.appendChild(cardIdent);

		// Card 2: Carrier & Cell Details
		var cardCell = E('div', { 'class': 'cbi-section', 'style': 'margin-bottom: 0;' }, [
			E('h3', {}, _('载波与基站参数')),
			E('table', { 'class': 'table', 'style': 'width: 100%; margin-bottom: 0;' }, [
				E('tr', {}, [E('td', { 'style': 'width: 35%; color: #666;' }, _('物理小区 PCI:')), E('td', { 'id': 'val_pci', 'style': 'font-weight: bold;' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('中心频点 ARFCN:')), E('td', { 'id': 'val_arfcn' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('下行频率/带宽:')), E('td', { 'id': 'val_dl' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('基站 Cell ID (NCI):')), E('td', { 'id': 'val_cellid', 'style': 'font-family: monospace;' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('跟踪区 TAC:')), E('td', { 'id': 'val_tac' }, '--')])
			])
		]);
		grid.appendChild(cardCell);

		// Card 3: Signal Quality Bars
		var cardSignal = E('div', { 'class': 'cbi-section', 'style': 'margin-bottom: 0;' }, [
			E('h3', {}, _('实时信号质量')),
			E('div', { 'id': 'signal_bars_container', 'style': 'padding-top: 5px;' }, [
				this.renderSignalBar('RSRP (参考信号功率)', null, 'dBm', -140, -44, -100, -85),
				this.renderSignalBar('SINR (信噪比)', null, 'dB', -20, 30, 5, 15),
				this.renderSignalBar('RSRQ (参考信号质量)', null, 'dB', -20, -3, -12, -8)
			])
		]);
		grid.appendChild(cardSignal);

		// Card 4: Lock Status Summary
		var cardLock = E('div', { 'class': 'cbi-section', 'style': 'margin-bottom: 0;' }, [
			E('h3', {}, _('频段锁定状态')),
			E('table', { 'class': 'table', 'style': 'width: 100%; margin-bottom: 0;' }, [
				E('tr', {}, [E('td', { 'style': 'width: 35%; color: #666;' }, _('5G NR 锁频:')), E('td', { 'id': 'val_lock_nr', 'style': 'font-weight: bold;' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('4G LTE 锁频:')), E('td', { 'id': 'val_lock_lte', 'style': 'font-weight: bold;' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('制式与掩码:')), E('td', { 'id': 'val_mode_mask' }, '--')]),
				E('tr', {}, [E('td', { 'style': 'color: #666;' }, _('配置持久化:')), E('td', { 'id': 'val_conf_lock', 'style': 'color: #888; font-size: 0.9em;' }, '--')])
			])
		]);
		grid.appendChild(cardLock);

		viewRoot.appendChild(grid);

		// Tabs Section
		var tabsNav = E('ul', { 'class': 'cbi-tabmenu', 'style': 'margin-bottom: 12px;' }, [
			E('li', { 'id': 'tabnav_nr', 'class': 'cbi-tab active' }, [
				E('a', {
					'href': '#',
					'click': function(e) { e.preventDefault(); self.switchTab('tab_nr'); }
				}, _('5G NR 锁频控制'))
			]),
			E('li', { 'id': 'tabnav_lte', 'class': 'cbi-tab' }, [
				E('a', {
					'href': '#',
					'click': function(e) { e.preventDefault(); self.switchTab('tab_lte'); }
				}, _('4G LTE 锁频控制'))
			]),
			E('li', { 'id': 'tabnav_neighbors', 'class': 'cbi-tab' }, [
				E('a', {
					'href': '#',
					'click': function(e) { e.preventDefault(); self.switchTab('tab_neighbors'); self.loadNeighbors(); }
				}, _('周边小区与邻区'))
			]),
			E('li', { 'id': 'tabnav_mode', 'class': 'cbi-tab' }, [
				E('a', {
					'href': '#',
					'click': function(e) { e.preventDefault(); self.switchTab('tab_mode'); }
				}, _('网络制式设置'))
			]),
			E('li', { 'id': 'tabnav_sms', 'class': 'cbi-tab' }, [
				E('a', {
					'href': '#',
					'click': function(e) { e.preventDefault(); self.switchTab('tab_sms'); self.loadSmsList(); }
				}, [
					_('短信收件箱'),
					E('span', { 'id': 'sms_badge_count', 'style': 'display: none; margin-left: 6px; background: #e74c3c; color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 8px;' }, '0')
				])
			]),
			E('li', { 'id': 'tabnav_at', 'class': 'cbi-tab' }, [
				E('a', {
					'href': '#',
					'click': function(e) { e.preventDefault(); self.switchTab('tab_at'); }
				}, _('AT 交互控制台'))
			])
		]);
		viewRoot.appendChild(tabsNav);

		// TAB 1: 5G NR Lock
		var tabNr = E('div', { 'id': 'tab_nr', 'class': 'cbi-section' }, [
			E('h3', {}, _('5G NR 锁频与小区配置')),
			E('div', { 'class': 'cbi-section-descr' }, _('通过海思 AT^NRFREQLOCK 指令控制 5G 注册策略。可直接一键锁定当前频段/小区，或自定义多选频段。')),

			// Quick Lock Section
			E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; padding: 12px; background: #eaf2f8; border-radius: 6px;' }, [
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() {
						if (!self.lastStatus || !self.lastStatus.network || !self.lastStatus.network.band) {
							ui.addNotification(null, E('p', {}, _('尚未获取到当前 5G 频段信息')), 'warning');
							return;
						}
						var b = self.lastStatus.network.band;
						if (!confirm(_('确定一键锁定当前频段 n%s 吗？').format(b))) return;
						self.executeNrBandLock([b]);
					}
				}, _('一键锁定当前频段')),
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() {
						if (!self.lastStatus || !self.lastStatus.network || !self.lastStatus.network.pci) {
							ui.addNotification(null, E('p', {}, _('尚未获取到当前小区 PCI 信息')), 'warning');
							return;
						}
						var n = self.lastStatus.network;
						var scs = (parseInt(n.band) <= 28) ? '0' : '1';
						if (!confirm(_('确定一键锁定当前服务小区 (n%s, ARFCN:%s, PCI:%s) 吗？').format(n.band, n.dl_arfcn, n.pci))) return;
						self.executeNrCellLock(n.band, n.dl_arfcn, scs, n.pci);
					}
				}, _('一键锁定当前小区 (PCI+ARFCN)')),
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function() {
						ui.showModal(_('正在解除 5G 锁定...'), [E('p', { 'class': 'spinning' }, _('正在发送 AT^NRFREQLOCK=0...'))]);
						callUnlockNr().then(function(res) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, res.message || _('5G 锁定已解除')), 'info');
							self.refreshAll();
						}).catch(function(e) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, e.message), 'error');
						});
					}
				}, _('解除 5G 锁定'))
			]),

			// Common 5G Bands Checkbox Grid
			E('h4', { 'style': 'margin-top: 15px;' }, _('常见 5G 频段多选 (支持多频段组合)')),
			E('div', { 'id': 'nr_band_checkboxes', 'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 12px;' },
				(caps.nr_bands || [
					{ band: '28', name: 'n28 (700MHz - 广电/移动)' },
					{ band: '41', name: 'n41 (2.6GHz - 移动)' },
					{ band: '78', name: 'n78 (3.5GHz - 电信/联通)' },
					{ band: '79', name: 'n79 (4.9GHz - 移动/广电)' },
					{ band: '1',  name: 'n1 (2.1GHz - 联通/电信)' }
				]).map(function(item) {
					return E('label', { 'style': 'display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff;' }, [
						E('input', { 'type': 'checkbox', 'class': 'nr_band_chk', 'value': item.band }),
						E('span', {}, item.name)
					]);
				})
			),
			E('div', { 'style': 'display: flex; gap: 8px; margin-bottom: 20px;' }, [
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function() {
						document.querySelectorAll('.nr_band_chk').forEach(function(c) { c.checked = true; });
					}
				}, _('全选')),
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function() {
						document.querySelectorAll('.nr_band_chk').forEach(function(c) { c.checked = false; });
					}
				}, _('清空')),
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() {
						var selected = [];
						document.querySelectorAll('.nr_band_chk:checked').forEach(function(c) {
							selected.push(c.value);
						});
						if (selected.length === 0) {
							ui.addNotification(null, E('p', {}, _('请至少勾选一个 5G 频段')), 'warning');
							return;
						}
						self.executeNrBandLock(selected);
					}
				}, _('应用锁定的 5G 频段'))
			]),

			// Advanced Cell Lock Form
			E('h4', {}, _('高级 5G 小区 / 频点锁定')),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('频段号 (Band)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'id': 'manual_nr_band', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '例如: 28 或 41' })
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('中心频点 (ARFCN)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'id': 'manual_nr_arfcn', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '例如: 153628' })
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('子载波间隔 (SCS)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('select', { 'id': 'manual_nr_scs', 'class': 'cbi-input-select' }, [
						E('option', { 'value': '0' }, '0: 15kHz (Sub-1GHz: n28/n8/n5)'),
						E('option', { 'value': '1' }, '1: 30kHz (Mid-band: n41/n78/n79/n1)')
					])
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('物理小区标识 (PCI)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'id': 'manual_nr_pci', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '例如: 128' }),
					E('div', { 'class': 'cbi-value-description' }, _('填入 PCI 则锁定指定基站小区；若留空仅锁定该频段的频点 (ARFCN)。'))
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, ''),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function() {
							var b = document.getElementById('manual_nr_band').value.trim();
							var a = document.getElementById('manual_nr_arfcn').value.trim();
							var s = document.getElementById('manual_nr_scs').value.trim();
							var p = document.getElementById('manual_nr_pci').value.trim();

							if (!b || !a) {
								ui.addNotification(null, E('p', {}, _('请至少填写 Band 和 ARFCN')), 'warning');
								return;
							}
							if (p) {
								self.executeNrCellLock(b, a, s, p);
							} else {
								self.executeNrFreqLock(b, a);
							}
						}
					}, _('提交锁定'))
				])
			])
		]);
		viewRoot.appendChild(tabNr);

		// TAB 2: LTE Lock
		var tabLte = E('div', { 'id': 'tab_lte', 'class': 'cbi-section', 'style': 'display: none;' }, [
			E('h3', {}, _('4G LTE 锁频控制')),
			E('div', { 'class': 'cbi-section-descr' }, _('通过海思 AT^LTEFREQLOCK 或 AT^SYSCFGEX 进行 4G 频段与小区锁定。')),

			// Common LTE Bands Grid
			E('h4', {}, _('常见 LTE 频段多选 (支持组合频段)')),
			E('div', { 'id': 'lte_band_checkboxes', 'style': 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px; margin-bottom: 12px;' },
				(caps.lte_bands || [
					{ band: '1',  name: 'B1 (2100MHz)' },
					{ band: '3',  name: 'B3 (1800MHz)' },
					{ band: '5',  name: 'B5 (850MHz)' },
					{ band: '8',  name: 'B8 (900MHz)' },
					{ band: '34', name: 'B34 (TD 2000MHz)' },
					{ band: '38', name: 'B38 (TD 2600MHz)' },
					{ band: '39', name: 'B39 (TD 1900MHz)' },
					{ band: '40', name: 'B40 (TD 2300MHz)' },
					{ band: '41', name: 'B41 (TD 2500MHz)' }
				]).map(function(item) {
					return E('label', { 'style': 'display: flex; align-items: center; gap: 8px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; background: #fff;' }, [
						E('input', { 'type': 'checkbox', 'class': 'lte_band_chk', 'value': item.band }),
						E('span', {}, item.name)
					]);
				})
			),
			E('div', { 'style': 'display: flex; gap: 8px; margin-bottom: 20px;' }, [
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function() {
						document.querySelectorAll('.lte_band_chk').forEach(function(c) { c.checked = true; });
					}
				}, _('全选')),
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function() {
						document.querySelectorAll('.lte_band_chk').forEach(function(c) { c.checked = false; });
					}
				}, _('清空')),
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() {
						var selected = [];
						document.querySelectorAll('.lte_band_chk:checked').forEach(function(c) {
							selected.push(c.value);
						});
						if (selected.length === 0) {
							ui.addNotification(null, E('p', {}, _('请至少勾选一个 4G 频段')), 'warning');
							return;
						}
						self.executeLteBandLock(selected);
					}
				}, _('应用 4G 锁频')),
				E('button', {
					'class': 'btn cbi-button-reset',
					'click': function() {
						ui.showModal(_('正在解除 4G 锁定...'), [E('p', { 'class': 'spinning' }, _('正在发送 AT^LTEFREQLOCK=0...'))]);
						callUnlockLte().then(function(res) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, res.message || _('4G 锁定已解除')), 'info');
							self.refreshAll();
						}).catch(function(e) {
							ui.hideModal();
							ui.addNotification(null, E('p', {}, e.message), 'error');
						});
					}
				}, _('解除 4G 锁定'))
			]),

			// Advanced LTE Cell Lock
			E('h4', {}, _('高级 4G 小区锁定 (PCI+EARFCN)')),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('LTE 频段 (Band)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'id': 'manual_lte_band', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '例如: 3' })
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('频点 (EARFCN)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'id': 'manual_lte_earfcn', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '例如: 1825' })
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('物理小区 (PCI)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'id': 'manual_lte_pci', 'type': 'text', 'class': 'cbi-input-text', 'placeholder': '例如: 123 (选填)' }),
					E('div', { 'class': 'cbi-value-description' }, _('填入 PCI 则锁定指定 4G 小区；若留空仅锁定该频段的频点 (EARFCN)。'))
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, ''),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function() {
							var b = document.getElementById('manual_lte_band').value.trim();
							var e = document.getElementById('manual_lte_earfcn').value.trim();
							var p = document.getElementById('manual_lte_pci').value.trim();
							if (!b || !e) {
								ui.addNotification(null, E('p', {}, _('请至少填写 Band 和 EARFCN')), 'warning');
								return;
							}
							if (p) {
								self.executeLteCellLock(b, e, p);
							} else {
								self.executeLteFreqLock(b, e);
							}
						}
					}, _('提交锁定'))
				])
			])
		]);
		viewRoot.appendChild(tabLte);

		// TAB 3: Neighbors
		var tabNeighbors = E('div', { 'id': 'tab_neighbors', 'class': 'cbi-section', 'style': 'display: none;' }, [
			E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center;' }, [
				E('h3', {}, _('周边基站与邻区信息 (SSB Scan)')),
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() { self.loadNeighbors(); }
				}, _('重新扫描邻区'))
			]),
			E('div', { 'class': 'cbi-section-descr' }, _('通过 AT^NRSSBID 读取当前主小区与周边扫描到的邻近基站小区信号。可一键直接锁定到目标强信号小区。')),
			E('div', { 'id': 'neighbors_table_container', 'style': 'margin-top: 10px;' }, [
				E('p', { 'class': 'spinning' }, _('点击标签页加载邻区数据...'))
			])
		]);
		viewRoot.appendChild(tabNeighbors);

		// TAB 4: Network Mode
		var tabMode = E('div', { 'id': 'tab_mode', 'class': 'cbi-section', 'style': 'display: none;' }, [
			E('h3', {}, _('网络制式与频段掩码 (SYSCFGEX)')),
			E('div', { 'class': 'cbi-section-descr' }, _('配置模组的全局制式偏好。修改后模组协议栈将自动重新搜索网络。')),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('网络制式选择')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('select', { 'id': 'select_network_mode', 'class': 'cbi-input-select' }, [
						E('option', { 'value': '08' }, _('5G NR + LTE (推荐，自动 5G/4G)')),
						E('option', { 'value': '03' }, _('仅 4G LTE')),
						E('option', { 'value': '00' }, _('全网自动模式 (含 2G/3G/4G/5G)'))
					])
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('LTE 频段掩码 (十六进制)')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('input', { 'id': 'input_lte_mask', 'type': 'text', 'class': 'cbi-input-text', 'value': '7FFFFFFFFFFFFFFF' }),
					E('div', { 'class': 'cbi-value-description' }, _('默认 7FFFFFFFFFFFFFFF 为全频段开放；出厂预设为 1E200000095 (含 B1/3/5/8/34/38/39/40/41)。'))
				])
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, ''),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button-action',
						'click': function() {
							var m = document.getElementById('select_network_mode').value;
							var mask = document.getElementById('input_lte_mask').value.trim();
							ui.showModal(_('正在设置网络模式...'), [E('p', { 'class': 'spinning' }, _('正在下发 AT^SYSCFGEX...'))]);
							callSetNetworkMode(m, mask).then(function(res) {
								ui.hideModal();
								ui.addNotification(null, E('p', {}, res.message || _('模式设置成功')), 'info');
								self.refreshAll();
							}).catch(function(e) {
								ui.hideModal();
								ui.addNotification(null, E('p', {}, e.message), 'error');
							});
						}
					}, _('保存并应用制式'))
				])
			])
		]);
		viewRoot.appendChild(tabMode);

		// TAB: SMS Inbox
		var tabSms = E('div', { 'id': 'tab_sms', 'class': 'cbi-section', 'style': 'display: none;' }, [
			E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
				E('h3', {}, _('短信收件箱 (内存安全暂存)')),
				E('div', { 'style': 'display: flex; gap: 8px;' }, [
					E('button', {
						'id': 'btn_refresh_sms',
						'class': 'btn cbi-button-action',
						'click': function(ev) { self.recvSms(ev.target); }
					}, _('收取/刷新最新短信')),
					E('button', {
						'class': 'btn cbi-button-reset',
						'click': function() { self.clearAllSms(); }
					}, _('清空所有短信'))
				])
			]),
			E('div', { 'class': 'cbi-section-descr' }, _('短信暂存在路由器 RAM 内存 (/tmp/mt571x_sms.json) 中，完全保护路由器 Flash 闪存寿命，系统重启自动清空。支持直接提取并接收 SIM 卡短信。')),
			E('div', { 'id': 'sms_table_container', 'style': 'margin-top: 12px;' }, [
				E('p', { 'class': 'spinning' }, _('点击标签页加载短信列表...'))
			])
		]);
		viewRoot.appendChild(tabSms);

		// TAB 5: AT Console
		var tabAt = E('div', { 'id': 'tab_at', 'class': 'cbi-section', 'style': 'display: none;' }, [
			E('h3', {}, _('AT 指令交互控制台')),
			E('div', { 'class': 'cbi-section-descr' }, _('直接向模组串口下发 AT 指令。受排队锁保护，避免并发冲突。')),

			// Shortcut Buttons
			E('div', { 'style': 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;' }, [
				['ATI', '设备信息'],
				['AT^HFREQINFO?', '当前载波/频段'],
				['AT^NRSSBID?', 'SSB 邻区扫描'],
				['AT^HCSQ?', '信号质量'],
				['AT+C5GREG?', '5G 注册状态'],
				['AT+COPS?', '当前运营商'],
				['AT^CHIPTEMP?', '芯片温度'],
				['AT^NRFREQLOCK?', '查询 5G 锁频'],
				['AT^LTEFREQLOCK?', '查询 4G 锁频'],
				['AT^SYSCFGEX?', '查询系统配置']
			].map(function(item) {
				return E('button', {
					'class': 'btn cbi-button-neutral',
					'style': 'font-size: 11px; padding: 4px 8px;',
					'click': function() {
						document.getElementById('at_input_cmd').value = item[0];
						self.executeAt(item[0]);
					}
				}, item[0] + ' (' + item[1] + ')');
			})),

			// Input field
			E('div', { 'style': 'display: flex; gap: 8px; margin-bottom: 12px;' }, [
				E('input', {
					'id': 'at_input_cmd',
					'type': 'text',
					'class': 'cbi-input-text',
					'placeholder': '输入 AT 命令，例如 ATI，按回车发送...',
					'style': 'flex: 1; font-family: monospace;',
					'keydown': function(ev) {
						if (ev.key === 'Enter') {
							self.executeAt(ev.target.value);
						}
					}
				}),
				E('button', {
					'class': 'btn cbi-button-action',
					'click': function() {
						self.executeAt(document.getElementById('at_input_cmd').value);
					}
				}, _('发送指令')),
				E('button', {
					'class': 'btn cbi-button-neutral',
					'click': function() {
						document.getElementById('at_output_console').textContent = '';
					}
				}, _('清空日志'))
			]),

			// Output Terminal Window
			E('pre', {
				'id': 'at_output_console',
				'style': 'background: #1e1e1e; color: #4af626; padding: 12px; border-radius: 6px; height: 260px; overflow-y: auto; font-family: monospace; font-size: 13px; line-height: 1.5; white-space: pre-wrap;'
			}, _('等待指令执行...'))
		]);
		viewRoot.appendChild(tabAt);

		// Initialize Polling
		poll.add(L.bind(this.pollStatus, this), this.pollInterval);

		// Initial UI populate
		this.updateStatusDisplay(initStatus);

		return viewRoot;
	},

	switchTab: function(tabId) {
		var tabs = ['tab_nr', 'tab_lte', 'tab_neighbors', 'tab_mode', 'tab_sms', 'tab_at'];
		tabs.forEach(function(t) {
			var el = document.getElementById(t);
			var nav = document.getElementById(t.replace('tab_', 'tabnav_'));
			if (el) el.style.display = (t === tabId) ? 'block' : 'none';
			if (nav) {
				if (t === tabId) nav.classList.add('active');
				else nav.classList.remove('active');
			}
		});
		this.activeTab = tabId;
	},

	pollStatus: function() {
		var self = this;
		return callStatus().then(function(res) {
			self.lastStatus = res;
			self.updateStatusDisplay(res);
		});
	},

	refreshAll: function(btn) {
		var self = this;
		if (btn) {
			btn.disabled = true;
			btn.textContent = _('刷新中...');
		}
		callStatus().then(function(res) {
			self.lastStatus = res;
			self.updateStatusDisplay(res);
			if (btn) {
				btn.disabled = false;
				btn.textContent = _('立即刷新');
			}
		}).catch(function(e) {
			if (btn) {
				btn.disabled = false;
				btn.textContent = _('立即刷新');
			}
		});
	},

	updateStatusDisplay: function(st) {
		if (!st) return;

		var badge = document.getElementById('status_badge');
		var portLbl = document.getElementById('port_label');

		if (badge) {
			if (st.online) {
				badge.textContent = _('模组在线');
				badge.style.background = '#2ecc71';
			} else {
				badge.textContent = _('模组离线 / 未就绪');
				badge.style.background = '#e74c3c';
			}
		}

		if (portLbl && st.port) {
			portLbl.textContent = _('AT 串口: ') + st.port + ' (/dev/mt571x-at)';
		}

		// Fill Identity & Network
		var net = st.network || {};
		var sig = st.signal || {};
		var alock = st.actual_lock || {};
		var clock = st.configured_lock || {};

		var elModel = document.getElementById('val_model');
		if (elModel) elModel.textContent = (st.model || 'MT5711_CN') + ' (' + (st.vendor || 'TD Tech') + ')';

		var elRat = document.getElementById('val_rat');
		if (elRat) elRat.textContent = net.rat ? (net.rat + ' (5G NR)') : '--';

		var elOper = document.getElementById('val_operator');
		if (elOper) elOper.textContent = net.operator || '--';

		var elBand = document.getElementById('val_band');
		if (elBand) elBand.textContent = net.band ? ('n' + net.band) : '--';

		var elTemp = document.getElementById('val_temp');
		if (elTemp) elTemp.textContent = (sig.temperature !== null && sig.temperature !== undefined) ? (sig.temperature + ' ℃') : '--';

		// Fill Cell details
		var elPci = document.getElementById('val_pci');
		if (elPci) elPci.textContent = (net.pci !== null && net.pci !== undefined) ? net.pci : '--';

		var elArfcn = document.getElementById('val_arfcn');
		if (elArfcn) elArfcn.textContent = net.dl_arfcn || '--';

		var elDl = document.getElementById('val_dl');
		if (elDl) {
			if (net.dl_freq_mhz && net.dl_bw_mhz) {
				elDl.textContent = net.dl_freq_mhz + ' MHz @ ' + net.dl_bw_mhz + ' MHz';
			} else {
				elDl.textContent = '--';
			}
		}

		var elCellId = document.getElementById('val_cellid');
		if (elCellId) elCellId.textContent = net.cell_id || '--';

		var elTac = document.getElementById('val_tac');
		if (elTac) elTac.textContent = net.tac || '--';

		// Update Signal Quality Bars
		var sigContainer = document.getElementById('signal_bars_container');
		if (sigContainer) {
			dom.content(sigContainer, [
				this.renderSignalBar('RSRP (参考信号功率)', sig.rsrp, 'dBm', -140, -44, -100, -85),
				this.renderSignalBar('SINR (信噪比)', sig.sinr, 'dB', -20, 30, 5, 15),
				this.renderSignalBar('RSRQ (参考信号质量)', sig.rsrq, 'dB', -20, -3, -12, -8)
			]);
		}

		// Update Lock Status
		var elLockNr = document.getElementById('val_lock_nr');
		if (elLockNr) {
			elLockNr.textContent = alock.nr_detail || '--';
			elLockNr.style.color = (alock.nr_mode !== '0') ? '#e67e22' : '#27ae60';
		}

		var elLockLte = document.getElementById('val_lock_lte');
		if (elLockLte) {
			elLockLte.textContent = alock.lte_detail || '--';
			elLockLte.style.color = (alock.lte_mode !== '0') ? '#e67e22' : '#27ae60';
		}

		var elModeMask = document.getElementById('val_mode_mask');
		if (elModeMask) {
			var modeText = (net.mode === '08') ? '5G+LTE (08)' : (net.mode === '03' ? '仅LTE (03)' : (net.mode || '--'));
			elModeMask.textContent = modeText + ' / 掩码: ' + (net.lte_mask || '--');
		}

		var elConfLock = document.getElementById('val_conf_lock');
		if (elConfLock) {
			var parts = [];
			if (clock.nr_mode && clock.nr_mode !== 'none') parts.push('NR: ' + clock.nr_mode + '(' + clock.nr_bands + ')');
			if (clock.lte_mode && clock.lte_mode !== 'none') parts.push('LTE: ' + clock.lte_mode + '(' + clock.lte_bands + ')');
			elConfLock.textContent = parts.length > 0 ? parts.join(' | ') : _('无持久化锁定');
		}

		// Update form defaults if empty
		var manualB = document.getElementById('manual_nr_band');
		if (manualB && !manualB.value && net.band) manualB.value = net.band;
		var manualA = document.getElementById('manual_nr_arfcn');
		if (manualA && !manualA.value && net.dl_arfcn) manualA.value = net.dl_arfcn;
		var manualP = document.getElementById('manual_nr_pci');
		if (manualP && !manualP.value && net.pci) manualP.value = net.pci;

		var selMode = document.getElementById('select_network_mode');
		if (selMode && net.mode) selMode.value = net.mode;
		var inpMask = document.getElementById('input_lte_mask');
		if (inpMask && net.lte_mask) inpMask.value = net.lte_mask;
	},

	loadNeighbors: function() {
		var self = this;
		var container = document.getElementById('neighbors_table_container');
		if (!container) return;

		dom.content(container, E('p', { 'class': 'spinning' }, _('正在扫描周边 5G 小区...')));

		callNeighbors().then(function(data) {
			var serving = data.serving || {};
			var nlist = data.neighbors || [];

			var rows = [];

			// Add Serving Cell
			if (serving.pci) {
				rows.push(E('tr', { 'style': 'background: #eafaf1;' }, [
					E('td', {}, E('span', { 'class': 'badge', 'style': 'background: #27ae60; color: #fff; padding: 2px 6px; border-radius: 3px;' }, _('当前主小区'))),
					E('td', {}, (self.lastStatus && self.lastStatus.network && self.lastStatus.network.band) ? ('n' + self.lastStatus.network.band) : 'NR'),
					E('td', {}, serving.arfcn || '--'),
					E('td', { 'style': 'font-weight: bold;' }, serving.pci),
					E('td', {}, serving.rsrp ? (serving.rsrp + ' dBm') : '--'),
					E('td', {}, (serving.sinr !== undefined) ? (serving.sinr + ' dB') : '--'),
					E('td', {}, E('em', { 'style': 'color: #27ae60;' }, _('正在使用')))
				]));
			}

			// Add Neighbor Cells
			nlist.forEach(function(item) {
				rows.push(E('tr', {}, [
					E('td', {}, E('span', { 'class': 'badge', 'style': 'background: #3498db; color: #fff; padding: 2px 6px; border-radius: 3px;' }, _('邻区基站'))),
					E('td', {}, (self.lastStatus && self.lastStatus.network && self.lastStatus.network.band) ? ('n' + self.lastStatus.network.band) : 'NR'),
					E('td', {}, item.arfcn),
					E('td', { 'style': 'font-weight: bold;' }, item.pci),
					E('td', {}, item.rsrp + ' dBm'),
					E('td', {}, (item.sinr !== undefined) ? (item.sinr + ' dB') : '--'),
					E('td', {}, [
						E('button', {
							'class': 'btn cbi-button-action',
							'style': 'font-size: 11px; padding: 3px 8px;',
							'click': function() {
								var b = (self.lastStatus && self.lastStatus.network && self.lastStatus.network.band) ? self.lastStatus.network.band : '28';
								var scs = (parseInt(b) <= 28) ? '0' : '1';
								if (!confirm(_('确定锁定至邻区基站 (Band: n%s, ARFCN: %s, PCI: %s) 吗？').format(b, item.arfcn, item.pci))) return;
								self.executeNrCellLock(b, item.arfcn, scs, item.pci);
							}
						}, _('锁定此小区'))
					])
				]));
			});

			if (rows.length === 0) {
				dom.content(container, E('p', {}, _('未扫描到邻区数据或模组处于单载波环境')));
				return;
			}

			var table = E('table', { 'class': 'table cbi-section-table' }, [
				E('tr', { 'class': 'tr cbi-section-table-titles' }, [
					E('th', { 'class': 'th' }, _('小区类型')),
					E('th', { 'class': 'th' }, _('频段')),
					E('th', { 'class': 'th' }, _('频点 (ARFCN)')),
					E('th', { 'class': 'th' }, _('物理小区 (PCI)')),
					E('th', { 'class': 'th' }, _('信号强度 (RSRP)')),
					E('th', { 'class': 'th' }, _('信噪比 (SINR)')),
					E('th', { 'class': 'th' }, _('操作'))
				]),
				E('tbody', {}, rows)
			]);

			dom.content(container, table);
		}).catch(function(e) {
			dom.content(container, E('p', { 'style': 'color: red;' }, _('扫描邻区失败: ') + e.message));
		});
	},

	executeNrBandLock: function(bands) {
		var self = this;
		ui.showModal(_('正在锁定 5G 频段...'), [E('p', { 'class': 'spinning' }, _('正在下发 AT^NRFREQLOCK...'))]);
		callLockNrBand(bands).then(function(res) {
			ui.hideModal();
			if (res.success) {
				ui.addNotification(null, E('p', {}, res.message), 'info');
				self.refreshAll();
			} else {
				ui.addNotification(null, E('p', {}, res.message || res.error), 'error');
			}
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	executeNrCellLock: function(band, arfcn, scs, pci) {
		var self = this;
		ui.showModal(_('正在锁定 5G 小区...'), [E('p', { 'class': 'spinning' }, _('正在下发 AT^NRFREQLOCK...'))]);
		callLockNrCell(band, arfcn, scs, pci).then(function(res) {
			ui.hideModal();
			if (res.success) {
				ui.addNotification(null, E('p', {}, res.message), 'info');
				self.refreshAll();
			} else {
				ui.addNotification(null, E('p', {}, res.message || res.error), 'error');
			}
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	executeNrFreqLock: function(band, arfcn) {
		var self = this;
		ui.showModal(_('正在锁定 5G 频点...'), [E('p', { 'class': 'spinning' }, _('正在下发 AT^NRFREQLOCK...'))]);
		callLockNrFreq(band, arfcn).then(function(res) {
			ui.hideModal();
			if (res.success) {
				ui.addNotification(null, E('p', {}, res.message), 'info');
				self.refreshAll();
			} else {
				ui.addNotification(null, E('p', {}, res.message || res.error), 'error');
			}
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	executeLteBandLock: function(bands) {
		var self = this;
		ui.showModal(_('正在锁定 4G 频段...'), [E('p', { 'class': 'spinning' }, _('正在下发 AT^LTEFREQLOCK...'))]);
		callLockLteBand(bands).then(function(res) {
			ui.hideModal();
			if (res.success) {
				ui.addNotification(null, E('p', {}, res.message), 'info');
				self.refreshAll();
			} else {
				ui.addNotification(null, E('p', {}, res.message || res.error), 'error');
			}
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	executeLteCellLock: function(band, earfcn, pci) {
		var self = this;
		ui.showModal(_('正在锁定 4G 小区...'), [E('p', { 'class': 'spinning' }, _('正在下发 AT^LTEFREQLOCK...'))]);
		callLockLteCell(band, earfcn, pci).then(function(res) {
			ui.hideModal();
			if (res.success) {
				ui.addNotification(null, E('p', {}, res.message), 'info');
				self.refreshAll();
			} else {
				ui.addNotification(null, E('p', {}, res.message || res.error), 'error');
			}
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	executeLteFreqLock: function(band, earfcn) {
		var self = this;
		ui.showModal(_('正在锁定 4G 频点...'), [E('p', { 'class': 'spinning' }, _('正在下发 AT^LTEFREQLOCK...'))]);
		callLockLteFreq(band, earfcn).then(function(res) {
			ui.hideModal();
			if (res.success) {
				ui.addNotification(null, E('p', {}, res.message), 'info');
				self.refreshAll();
			} else {
				ui.addNotification(null, E('p', {}, res.message || res.error), 'error');
			}
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	executeAt: function(cmd) {
		if (!cmd || !cmd.trim()) return;
		cmd = cmd.trim();

		var consoleEl = document.getElementById('at_output_console');
		if (consoleEl) {
			consoleEl.textContent += '\n> ' + cmd + '\n' + _('正在等待模组响应...') + '\n';
			consoleEl.scrollTop = consoleEl.scrollHeight;
		}

		callSendAt(cmd).then(function(res) {
			if (consoleEl) {
				var resp = res.response || _('(无返回内容)');
				consoleEl.textContent += resp + '\n';
				consoleEl.scrollTop = consoleEl.scrollHeight;
			}
		}).catch(function(e) {
			if (consoleEl) {
				consoleEl.textContent += _('错误: ') + e.message + '\n';
				consoleEl.scrollTop = consoleEl.scrollHeight;
			}
		});
	},

	loadSmsList: function() {
		var self = this;
		var container = document.getElementById('sms_table_container');
		if (!container) return;

		callSmsList().then(function(res) {
			self.renderSmsTable(res);
		}).catch(function(e) {
			dom.content(container, E('p', { 'style': 'color: red;' }, _('加载短信失败: ') + e.message));
		});
	},

	recvSms: function(btn) {
		var self = this;
		if (btn) {
			btn.disabled = true;
			btn.textContent = _('正在从 SIM 卡提取短信...');
		}
		var container = document.getElementById('sms_table_container');
		if (container) {
			dom.content(container, E('p', { 'class': 'spinning' }, _('正在读取 SIM 卡短信...')));
		}

		callSmsRecv().then(function(res) {
			if (btn) {
				btn.disabled = false;
				btn.textContent = _('收取/刷新最新短信');
			}
			self.renderSmsTable(res);
			ui.addNotification(null, E('p', {}, _('短信提取完成，当前共有 %d 条消息').format(res.count || 0)), 'info');
		}).catch(function(e) {
			if (btn) {
				btn.disabled = false;
				btn.textContent = _('收取/刷新最新短信');
			}
			ui.addNotification(null, E('p', {}, _('接收短信失败: ') + e.message), 'error');
		});
	},

	renderSmsTable: function(data) {
		var self = this;
		var container = document.getElementById('sms_table_container');
		if (!container) return;

		var msgs = (data && data.messages) ? data.messages : [];
		var badge = document.getElementById('sms_badge_count');
		if (badge) {
			badge.textContent = msgs.length;
			badge.style.display = msgs.length > 0 ? 'inline-block' : 'none';
		}

		if (msgs.length === 0) {
			dom.content(container, E('div', { 'style': 'padding: 24px; text-align: center; color: #888; background: #fafafa; border: 1px dashed #ddd; border-radius: 6px;' }, [
				E('div', { 'style': 'font-size: 24px; margin-bottom: 8px;' }, '📭'),
				E('p', { 'style': 'font-weight: bold; margin-bottom: 4px;' }, _('暂存箱内暂无短信记录')),
				E('p', { 'style': 'font-size: 0.9em; color: #999;' }, _('可点击上方“收取/刷新最新短信”按钮，从 SIM 卡中提取新收到的短信。'))
			]));
			return;
		}

		var rows = msgs.map(function(m, idx) {
			return E('tr', {}, [
				E('td', { 'style': 'width: 50px; text-align: center; color: #666;' }, String(idx + 1)),
				E('td', { 'style': 'width: 150px; font-weight: bold; color: #2980b9;' }, m.sender || _('未知号码')),
				E('td', { 'style': 'width: 160px; color: #666; font-size: 0.9em;' }, m.timestamp || '--'),
				E('td', { 'style': 'white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.5;' }, [
					E('div', { 'style': 'margin-bottom: 6px;' }, m.content || _('(空短信)')),
					E('button', {
						'class': 'btn cbi-button-neutral',
						'style': 'font-size: 10px; padding: 2px 6px;',
						'click': function(ev) {
							if (navigator.clipboard) {
								navigator.clipboard.writeText(m.content || '');
								ui.addNotification(null, E('p', {}, _('短信内容已复制到剪贴板')), 'info');
							} else {
								var ta = document.createElement('textarea');
								ta.value = m.content || '';
								document.body.appendChild(ta);
								ta.select();
								document.execCommand('copy');
								document.body.removeChild(ta);
								ui.addNotification(null, E('p', {}, _('短信内容已复制到剪贴板')), 'info');
							}
						}
					}, _('复制内容'))
				]),
				E('td', { 'style': 'width: 70px; text-align: center;' }, [
					E('button', {
						'class': 'btn cbi-button-negative',
						'style': 'font-size: 11px; padding: 3px 8px;',
						'click': function() {
							if (!confirm(_('确定删除来自 %s 的这条短信吗？').format(m.sender))) return;
							self.deleteSms(m.id, m.index);
						}
					}, _('删除'))
				])
			]);
		});

		var table = E('table', { 'class': 'table cbi-section-table' }, [
			E('tr', { 'class': 'tr cbi-section-table-titles' }, [
				E('th', { 'class': 'th', 'style': 'text-align: center; width: 50px;' }, _('序号')),
				E('th', { 'class': 'th', 'style': 'width: 150px;' }, _('发件人号码')),
				E('th', { 'class': 'th', 'style': 'width: 160px;' }, _('接收时间')),
				E('th', { 'class': 'th' }, _('短信内容')),
				E('th', { 'class': 'th', 'style': 'text-align: center; width: 70px;' }, _('操作'))
			]),
			E('tbody', {}, rows)
		]);

		dom.content(container, [
			E('div', { 'style': 'display: flex; justify-content: space-between; font-size: 0.85em; color: #888; margin-bottom: 8px;' }, [
				E('span', {}, _('共计 %d 条短信（存储于 /tmp 内存）').format(msgs.length)),
				E('span', {}, data.updated_at ? (_('更新时间: ') + data.updated_at) : '')
			]),
			table
		]);
	},

	deleteSms: function(id, index) {
		var self = this;
		ui.showModal(_('正在删除短信...'), [E('p', { 'class': 'spinning' }, _('正在从存储中移除短信...'))]);
		callSmsDelete(id, index).then(function(res) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, res.message || _('短信已删除')), 'info');
			self.loadSmsList();
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	clearAllSms: function() {
		var self = this;
		if (!confirm(_('确定清空所有暂存短信以及 SIM 卡中的短信吗？该操作不可逆！'))) return;
		ui.showModal(_('正在清空短信...'), [E('p', { 'class': 'spinning' }, _('正在清空所有短信...'))]);
		callSmsClearAll().then(function(res) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, res.message || _('短信已清空')), 'info');
			self.loadSmsList();
		}).catch(function(e) {
			ui.hideModal();
			ui.addNotification(null, E('p', {}, e.message), 'error');
		});
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
