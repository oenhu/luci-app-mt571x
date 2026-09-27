# luci-app-mt571x

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)
[![OpenWrt Version](https://img.shields.io/badge/OpenWrt-21.02%20%7C%2023.05%20%7C%2024.10-brightgreen.svg)](https://openwrt.org)
[![Platform](https://img.shields.io/badge/Architecture-all-orange.svg)](https://github.com)
[![Modem](https://img.shields.io/badge/Hardware-MT5710%20%7C%20MT5711-blueviolet.svg)](https://github.com)

**luci-app-mt571x** 是面向 **TD Tech 鼎桥 MT5710_CN / MT5711_CN**（海思 Balong 5G 基带，USB VID:PID `3466:3301`）的独立、轻量级 OpenWrt / ImmortalWrt LuCI 管理插件。

支持 5G/4G 频段与物理小区（PCI/ARFCN）锁定、实时信号健康看板、周边基站 SSB 邻区扫描与一键切换、短信接收（`/tmp` 内存安全暂存）、网络制式切换以及 AT 命令行控制台。

---

## 目录

- [一、项目背景与解决的痛点](#一项目背景与解决的痛点)
- [二、核心特性](#二核心特性)
- [三、界面预览与功能模块](#三界面预览与功能模块)
- [四、安装方式](#四安装方式)
  - [1. 使用预打包 IPK 安装 (推荐)](#1-使用预打包-ipk-安装-推荐)
  - [2. 集成进 OpenWrt 源码编译](#2-集成进-openwrt-源码编译)
  - [3. 本地打包构建](#3-本地打包构建)
- [五、关键 AT 指令速查表](#五关键-at-指令速查表)
- [六、常见问题与排查 (FAQ)](#六常见问题与排查-faq)
- [七、代码架构](#七代码架构)
- [八、开源协议与鸣谢](#八开源协议与鸣谢)

---

## 一、项目背景与解决的痛点

在 OpenWrt / ImmortalWrt 固件下使用鼎桥 MT5710/MT5711 5G 模组（USB VID:PID `3466:3301`）通常面临以下痛点：

1. **开机无法自动识别串口**：原生内核 `option` 驱动未内置 `3466:3301` ID，每次路由器重启后串口消失，无法下发 AT 命令。
2. **盲目绑定导致网络崩溃**：若粗暴向 `new_id` 写入 `3466 3301`，`option` 驱动会抢占 Interface 0/1 的 RNDIS 网卡接口，导致网络接口失效。
3. **第三方 Modem 框架过重或不适配**：ModemManager / QModem 往往不原生支持鼎桥海思特有的 `AT^NRFREQLOCK` 语法，且后台常驻守护进程消耗宝贵的路由器 CPU 与内存。
4. **多任务 AT 并发冲突**：状态轮询与锁频指令交织执行时容易导致串口冲突丢响应。

**`luci-app-mt571x`** 专为该芯片定制，具备**独立、零常驻守护进程、开机即用、安全自愈**等特性。

---

## 二、核心特性

- 🚀 **开机与热插拔自愈（无需人工干预）**：
  - 开机服务 (`/etc/init.d/mt571x`，`START=19`) 启动时自动写入过滤规则：`echo "3466 3301 ff" > /sys/bus/usb-serial/drivers/option1/new_id`，精确绑定 AT/DIAG 串口，**绝不抢占 RNDIS 网卡接口**。
  - 热插拔脚本 (`/etc/hotplug.d/usb/10-mt571x`) 实时捕获模组重新插拔与 USB 重启事件。
  - 底层驱动执行器 (`mt571x-at`) 内置二次自愈机制，即使开机延时枚举，首次调用即可瞬间完成驱动绑定并建立 `/dev/mt571x-at` 软链接。
- 📶 **5G NR 深度锁频控制 (`AT^NRFREQLOCK`)**：
  - **一键锁定当前频段**：自动抓取当前注册频段（如广电/移动 n28），一键下发锁定。
  - **一键锁定当前服务基站**：捕获当前 ARFCN、SCS 与物理小区 PCI，一键绑定小区。
  - **多频段组合锁定**：提供 n28、n41、n78、n79、n1 等多选网格，支持自由组合与一键下发。
  - **高级频点与物理小区锁定**：支持手动填入 Band、中心频点 (ARFCN)、子载波间隔 (SCS) 与物理小区识别码 (PCI)。
- 📡 **4G LTE 锁频控制 (`AT^LTEFREQLOCK`)**：
  - 常见 LTE 频段多选：支持 B1/B3/B5/B8/B34/B38/B39/B40/B41 自由多选组合锁定。
  - 支持手动指定 EARFCN 频点与 PCI 小区锁定。
- 🗼 **周边基站与 SSB 邻区扫描 (`AT^NRSSBID?`)**：
  - 实时解析主小区与周边所有扫描到的 5G 信号塔，清晰展示物理小区 PCI、频点、RSRP、SINR。
  - 提供**一键锁定邻区**功能，当主基站负荷过高时可直接一键切换至周边强信号基站。
- 📊 **实时网络与信号看板**：
  - 5 秒动态刷新：模组型号、芯片温度、网络制式（NR-5GC）、运营商名称、当前频段、ARFCN、下行频率与带宽、Cell ID (NCI)、跟踪区 TAC。
  - 彩色动态信号柱状图：RSRP (参考信号接收功率)、SINR (信噪比)、RSRQ (参考信号质量)。
- ✉️ **短信接收与 `/tmp` 内存安全暂存**：
  - 支持直接提取 SIM 卡短信，底层自动完成 PDU 与 UCS2 中文解码，完美支持中文长短信与多段短信拼接。
  - **零 Flash 磨损与隐私保护**：所有短信严格暂存在路由器内存（`/tmp/mt571x_sms.json`），绝不频繁擦写路由器闪存颗粒，断电重启自动清空。
  - 界面提供一键复制短信正文、单条删除与一键清空全部短信功能。
- 🛡️ **安全解锁与出厂模式恢复**：
  - **一键解锁 (Unlock All)**：下发 `AT^NRFREQLOCK=0` 与 `AT^LTEFREQLOCK=0`，清除所有锁频限制，恢复自动搜网。
  - **恢复自动出厂模式**：下发 `AT^SYSCFGEX="08",0,1,2,7FFFFFFFFFFFFFFF`，重设全频段掩码并恢复 5G+4G 自动漫游。
  - **模组软重启**：支持下发 `AT+CFUN=1,1` 重置射频协议栈。
- 💻 **AT 交互控制台**：
  - 预设常用快捷指令（`ATI`、`AT^HFREQINFO?`、`AT^NRSSBID?`、`AT^HCSQ?`、`AT+C5GREG?`、`AT^CHIPTEMP?` 等）。
  - 支持命令行自由下发，基于 Linux `flock` 严格保证串口指令原子化排队，带终端日志输出。

---

## 三、界面预览与功能模块

进入 LuCI 后，点击主导航栏 **Modem（调制解调器）** $\rightarrow$ **5G/4G 锁频控制**，包含 6 大标签页：

| 标签页 | 功能简述 |
| :--- | :--- |
| **5G NR 锁频控制** | 一键锁当前频段、一键锁当前小区、常见 5G 频段多选、高级手动 ARFCN/PCI 锁定、解除 5G 锁定 |
| **4G LTE 锁频控制** | 常见 LTE 频段多选网格、高级 EARFCN/PCI 小区锁定、解除 4G 锁定 |
| **周边基站与邻区** | 下发 `AT^NRSSBID?` 扫描附近所有 5G 基站，查看 PCI/RSRP/SINR，支持一键锁定目标基站 |
| **网络制式设置** | 切换 `5G+LTE (08)`、`仅4G (03)`、`全网自动 (00)`，支持自定义十六进制频段掩码 |
| **短信收件箱** | 提取 SIM 卡短信，展示发件人、时间、正文，支持一键复制内容与删除，暂存于 `/tmp` |
| **AT 交互控制台** | 内置 10+ 常用海思 AT 快捷按钮，支持输入任意 AT 指令并实时查看回显日志 |

---

## 四、安装方式

### 1. 使用预打包 IPK 安装 (推荐)

架构标记为 `all`，适用于 **所有 CPU 架构**（aarch64 / arm / x86_64 / mips 等）：

1. 从 [Releases 页面](https://github.com/oenhu/luci-app-mt571x/releases) 下载最新版的 `luci-app-mt571x_*.ipk`。
2. 上传并安装：
   - **方式 A (LuCI 网页界面)**：登录路由器 Web 后台，进入 **系统** $\rightarrow$ **软件包** $\rightarrow$ 点击 **上传软件包**，选择 `.ipk` 并安装。
   - **方式 B (命令行)**：
     ```bash
     scp luci-app-mt571x_1.0.0-1_all.ipk root@192.168.1.1:/tmp/
     ssh root@192.168.1.1 "opkg install /tmp/luci-app-mt571x_1.0.0-1_all.ipk"
     ```

> **依赖提示**：本插件运行依赖 `jq` 与 `kmod-usb-serial-option` 内核模块。ImmortalWrt 固件通常已内置；若提示依赖缺失，请先执行：
> ```bash
> opkg update && opkg install jq kmod-usb-serial-option
> ```

---

### 2. 集成进 OpenWrt 源码编译

#### 方式 A：加入 feeds 编译
在源码根目录的 `feeds.conf.default` 中加入：
```text
src-git mt571x https://github.com/oenhu/luci-app-mt571x.git
```
执行更新与安装：
```bash
./scripts/feeds update mt571x
./scripts/feeds install -a -p mt571x
```

#### 方式 B：手动放置到 package 目录
```bash
git clone https://github.com/oenhu/luci-app-mt571x.git package/luci-app-mt571x
```

进入 `make menuconfig` 勾选：
```text
LuCI --->
  3. Applications --->
    <*> luci-app-mt571x........ LuCI Support for TD Tech MT5710/MT5711 5G Modem
```
执行编译：
```bash
make package/luci-app-mt571x/compile V=s
```

---

### 3. 本地打包构建

项目内置独立打包脚本 `build_ipk.py`（纯 Python 3 实现，无额外依赖）：
```bash
python3 build_ipk.py
```
执行后即在根目录生成 `luci-app-mt571x_1.0.0-1_all.ipk`。

---

## 五、关键 AT 指令速查表（鼎桥 MT5710/MT5711 海思基带）

| 功能 | AT 指令语法 | 示例 / 说明 |
| :--- | :--- | :--- |
| **查询 5G 锁频状态** | `AT^NRFREQLOCK?` | 返回 `0`（未锁）、`1`（锁频点）、`2`（锁小区）、`3`（锁频段） |
| **解除 5G 锁定** | `AT^NRFREQLOCK=0` | 清除 5G 频段与小区锁定限制 |
| **锁定 5G 频段** | `AT^NRFREQLOCK=3,0,<数量>,"<频段列表>"` | 锁定 n28：`AT^NRFREQLOCK=3,0,1,"28"`；多频段：`AT^NRFREQLOCK=3,0,2,"28,41"` |
| **锁定 5G 小区** | `AT^NRFREQLOCK=2,0,1,"<Band>","<ARFCN>","<SCS>","<PCI>"` | 例：`AT^NRFREQLOCK=2,0,1,"28","153628","0","128"` (SCS: 0=15k, 1=30k) |
| **锁定 5G 频点** | `AT^NRFREQLOCK=1,0,1,"<Band>","<ARFCN>"` | 例：`AT^NRFREQLOCK=1,0,1,"28","153628"` |
| **查询 4G 锁频状态** | `AT^LTEFREQLOCK?` | 返回 `0`（未锁）、`1`（锁频点）、`2`（锁小区）、`3`（锁频段） |
| **解除 4G 锁定** | `AT^LTEFREQLOCK=0` | 清除 4G 锁定限制 |
| **锁定 4G 频段** | `AT^LTEFREQLOCK=3,0,<数量>,"<频段列表>"` | 例：锁定 B3+B8：`AT^LTEFREQLOCK=3,0,2,"3,8"` |
| **锁定 4G 小区** | `AT^LTEFREQLOCK=2,0,1,"<Band>","<EARFCN>","<PCI>"` | 例：`AT^LTEFREQLOCK=2,0,1,"3","1825","123"` |
| **SSB 邻区扫描** | `AT^NRSSBID?` | 返回主服务基站及周围扫描到的邻区物理小区（PCI、ARFCN、RSRP、SINR） |
| **频段与载波详情** | `AT^HFREQINFO?` | 返回当前网络制式、上行/下行 ARFCN、中心频率与频宽 (kHz) |
| **信号强度质量** | `AT^HCSQ?` | 返回当前制式的信号综合指数（RSRP、SINR、RSRQ） |
| **芯片温度** | `AT^CHIPTEMP?` | 返回基带处理器当前实时运行温度 (℃) |
| **网络模式配置** | `AT^SYSCFGEX="<模式>",<order>,<roam>,<srvdomain>,<lte_mask>` | 例出厂设置：`AT^SYSCFGEX="08",0,1,2,7FFFFFFFFFFFFFFF` |
| **清空 SIM 卡短信**| `AT+CMGD=1,4` | 清空首选存储介质内的全部短信 |
| **协议栈软重启** | `AT+CFUN=1,1` | 快速重置射频模块与网络注册会话 |

---

## 六、常见问题与排查 (FAQ)

### Q1: 为什么我的路由器开机后没有 `/dev/ttyUSB1`？
- **A**: 鼎桥 MT5710/MT5711 的 VID:PID 为 `3466:3301`，上游 Linux 内核 `option` 驱动没有预置该 ID。安装本插件后，启动服务 `/etc/init.d/mt571x` 会在开机时自动执行 `echo "3466 3301 ff" > .../new_id` 完成安全绑定，无需手动执行。若仍未生成，请检查 `dmesg | grep -i usb` 确认模组是否正常上电。

### Q2: 为什么有时强制锁定 n41 (2.6GHz) 会出现脱网或搜不到信号？
- **A**: 
  1. **物理覆盖差异**：700MHz (n28) 是低频黄金频段，穿透衰减小；而 2.6GHz (n41) 为高频频段，室内衰减通常比 n28 强 15~20 dB。若室内 n41 RSRP 低于 -105 dBm 且 SINR 为负值，物理层将无法维持控制信道同步。
  2. **运营商策略**：如果使用的是中国广电 SIM 卡，广电核心网默认优先驻留自有 n28 频段；异网漫游接入移动 n41 时，若信号未达门限可能会被下发 RRC 重定向。
  3. **建议**：建议将路由器天线靠近窗边摆放，确保高频信号充足；在广电卡环境下，n28 通常能获得更稳定的低时延表现。

### Q3: 短信暂存保存在 `/tmp`，路由器重启后会丢失吗？
- **A**: 
  - 是的，`/tmp` 在 OpenWrt 中是 RAM 内存文件系统（tmpfs）。这样设计是为了**彻底保护路由器内置 Flash 颗粒免受频繁擦写磨损**，同时保护个人验证码隐私。
  - 若需要保留 SIM 卡中的原始短信，只要不在网页上点击“清空所有短信”，SIM 卡硬件本身仍会妥善保存。

---

## 七、代码架构

```text
luci-app-mt571x/
├── Makefile                                    # OpenWrt Package 编译定义
├── root/
│   ├── etc/
│   │   ├── config/mt571x                      # UCI 锁频配置持久化存储
│   │   ├── init.d/mt571x                      # 开机自愈服务 (START=19)
│   │   └── hotplug.d/usb/10-mt571x            # USB 插拔事件捕获与热绑定
│   ├── usr/
│   │   ├── bin/mt571x-at                      # 串口动态发现、接口校验与 flock 排队通信工具
│   │   ├── libexec/rpcd/mt571x                # LuCI rpcd 后端微服务 (状态解析/锁频/短信处理)
│   │   └── share/
│   │       ├── luci/menu.d/luci-app-mt571x.json # LuCI 导航菜单项 (Modem -> 5G/4G 锁频控制)
│   │       └── rpcd/acl.d/luci-app-mt571x.json  # ubus / uci ACL 访问权限控制
│   └── www/
│       └── luci-static/resources/view/modem/mt571x.js # 现代 LuCI JavaScript 响应式前端
├── .github/
│   └── workflows/
│       └── build.yml                           # GitHub Actions 自动化构建与 Release 发布
├── build_ipk.py                                # 本地离线打包生成 .ipk 脚本
├── deploy.sh                                   # SSH 自动化热部署调试脚本
├── LICENSE                                     # GPL-3.0 开源许可证
└── README.md                                   # 项目全量说明文档
```

---

## 八、开源协议与鸣谢

- 本项目采用 [GNU General Public License v3.0](LICENSE) 开源协议。
- 感谢 OpenWrt / ImmortalWrt 社区与海思基带技术研究先驱者的经验分享。
- 欢迎提交 Issue 与 Pull Request 共同完善！
