/**
 * dsh-inbox — browser half.
 *
 * A unified inbox: a `main` keyed panel plus a matching `sidebar.panellist`
 * entry. Sits on top of the host half's POST /api/dsh-inbox/state route.
 */
;(function () {
  var MODULE_ID = 'dsh-inbox'
  var loader = typeof window !== 'undefined' ? window.__ModuleLoader__ : undefined
  if (!loader || typeof loader.load !== 'function') return

  loader.load({
    id: MODULE_ID,
    factory: function (require) {
      var module = { exports: {} }
      var React = require('react')
      var h = React.createElement
      var NS = 'dsh-inbox'

      var ZH = {
        'nav.title': '信息中心',
        'page.title': '信息中心',
        'page.subtitle': '{accounts} 个账号 · {unread} 封未读 · 共 {total} 封',
        'page.subtitleEmpty': '还没有接入邮箱',
        'tab.all': '全部',
        'tab.gmail': 'Gmail',
        'tab.qqmail': 'QQ邮箱',
        'filter.account': '账号',
        'filter.allAccounts': '全部账号',
        'filter.search': '搜索发件人 / 主题…',
        'filter.unread': '仅未读',
        'action.refresh': '同步',
        'action.refreshing': '同步中…',
        'action.settings': '账号设置',
        'action.markRead': '标记已读',
        'action.markUnread': '标记未读',
        'action.back': '返回',
        'detail.empty': '从左侧选择一封邮件查看',
        'detail.loading': '正在加载正文…',
        'detail.noBody': '（无正文内容）',
        'detail.attachments': '附件',
        'detail.to': '收件人',
        'empty.none': '还没有邮件。接入邮箱并点击「同步」试试。',
        'empty.noAccount': '还没有接入邮箱，点击右上角「账号设置」添加 Gmail 或 QQ邮箱。',
        'empty.filtered': '没有符合筛选条件的邮件。',
        'settings.title': '账号管理',
        'settings.close': '收起',
        'settings.add': '添加邮箱账号',
        'settings.edit': '编辑',
        'settings.cancel': '取消',
        'settings.channel': '渠道',
        'settings.email': '邮箱地址',
        'settings.password': '应用专用密码 / 授权码',
        'settings.passwordKeep': '留空表示不修改',
        'settings.label': '备注名称',
        'settings.host': 'IMAP 服务器',
        'settings.port': '端口',
        'settings.test': '测试连接',
        'settings.testing': '测试中…',
        'settings.save': '保存账号',
        'settings.saving': '保存中…',
        'settings.delete': '删除',
        'settings.deleteConfirm': '确定删除账号「{label}」？其已同步的邮件也会一并移除。',
        'settings.syncNow': '立即同步',
        'settings.lastSync': '上次同步：{time}',
        'settings.never': '尚未同步',
        'settings.error': '错误：{msg}',
        'settings.enabled': '已启用',
        'settings.disabled': '已停用',
        'settings.testOk': '连接成功，收件箱共 {n} 封',
        'settings.testFail': '连接失败：{msg}',
        'settings.saved': '已保存',
        'settings.saveFailed': '保存失败：{msg}',
        'settings.deleted': '已删除',
        'settings.help.gmail': 'Gmail：在 Google 账号开启两步验证后，生成「应用专用密码」，填入上方密码框。IMAP 主机 imap.gmail.com:993。',
        'settings.help.qqmail': 'QQ邮箱：网页版「设置 → 账号与安全」开启 IMAP，短信验证后获取 16 位授权码作为密码。IMAP 主机 imap.qq.com:993。',
        'settings.needEmail': '请填写有效的邮箱地址',
        'settings.needPassword': '新账号需要填写密码 / 授权码',
        'time.yesterday': '昨天',
        'common.on': '开',
        'common.off': '关',
      }

      var EN = {
        'nav.title': 'Inbox',
        'page.title': 'Inbox',
        'page.subtitle': '{accounts} accounts · {unread} unread · {total} total',
        'page.subtitleEmpty': 'No mailbox connected yet',
        'tab.all': 'All',
        'tab.gmail': 'Gmail',
        'tab.qqmail': 'QQ Mail',
        'filter.account': 'Account',
        'filter.allAccounts': 'All accounts',
        'filter.search': 'Search sender / subject…',
        'filter.unread': 'Unread only',
        'action.refresh': 'Sync',
        'action.refreshing': 'Syncing…',
        'action.settings': 'Accounts',
        'action.markRead': 'Mark read',
        'action.markUnread': 'Mark unread',
        'action.back': 'Back',
        'detail.empty': 'Select a message on the left',
        'detail.loading': 'Loading body…',
        'detail.noBody': '(no body content)',
        'detail.attachments': 'Attachments',
        'detail.to': 'To',
        'empty.none': 'No mail yet. Connect a mailbox and press Sync.',
        'empty.noAccount': 'No mailbox connected. Use Accounts (top right) to add Gmail or QQ Mail.',
        'empty.filtered': 'No messages match the current filter.',
        'settings.title': 'Accounts',
        'settings.close': 'Collapse',
        'settings.add': 'Add mailbox',
        'settings.edit': 'Edit',
        'settings.cancel': 'Cancel',
        'settings.channel': 'Channel',
        'settings.email': 'Email address',
        'settings.password': 'App password / auth code',
        'settings.passwordKeep': 'leave blank to keep',
        'settings.label': 'Display name',
        'settings.host': 'IMAP server',
        'settings.port': 'Port',
        'settings.test': 'Test connection',
        'settings.testing': 'Testing…',
        'settings.save': 'Save',
        'settings.saving': 'Saving…',
        'settings.delete': 'Delete',
        'settings.deleteConfirm': 'Delete account "{label}"? Its synced mail will be removed too.',
        'settings.syncNow': 'Sync now',
        'settings.lastSync': 'Last sync: {time}',
        'settings.never': 'never synced',
        'settings.error': 'Error: {msg}',
        'settings.enabled': 'enabled',
        'settings.disabled': 'disabled',
        'settings.testOk': 'Connected — {n} messages in inbox',
        'settings.testFail': 'Failed: {msg}',
        'settings.saved': 'Saved',
        'settings.saveFailed': 'Save failed: {msg}',
        'settings.deleted': 'Deleted',
        'settings.help.gmail': 'Gmail: enable 2-Step Verification, create an App Password, and paste it above. IMAP host imap.gmail.com:993.',
        'settings.help.qqmail': 'QQ Mail: enable IMAP in Settings → Account & Security, verify by SMS, then use the 16-digit auth code as the password. IMAP host imap.qq.com:993.',
        'settings.needEmail': 'Enter a valid email address',
        'settings.needPassword': 'A new mailbox needs a password / auth code',
        'time.yesterday': 'Yesterday',
        'common.on': 'on',
        'common.off': 'off',
      }

      var CHANNEL_META = {
        gmail: { label: 'Gmail', color: '#ea4335' },
        qqmail: { label: 'QQ邮箱', color: '#12b7f5' },
      }

      function injectStyles() {
        if (typeof document === 'undefined') return
        var marker = 'dsh-inbox/styles'
        if (document.querySelector('style[data-plugin-css="' + marker + '"]') !== null) return
        var el = document.createElement('style')
        el.dataset.plugin = 'dsh-inbox'
        el.dataset.pluginCss = marker
        el.textContent = [
          '.inb-page{box-sizing:border-box;height:100%;min-height:0;display:flex;flex-direction:column;background:linear-gradient(180deg,color-mix(in srgb,var(--dsw-alias-bg-base,#14161b) 72%,transparent),color-mix(in srgb,var(--dsw-alias-bg-base,#14161b) 94%,transparent));color:var(--dsw-alias-label-primary,#e6e6e6);font-size:13px;line-height:1.55;overflow:hidden;container:inb/inline-size;backdrop-filter:blur(16px)}',
          '.inb-header{flex:none;max-width:1180px;width:100%;margin:0 auto;padding:24px clamp(18px,2.8cqi,40px) 10px}',
          '.inb-titlerow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
          '.inb-h1{display:flex;align-items:center;gap:10px;margin:0;font-size:21px;font-weight:700;letter-spacing:.01em}',
          '.inb-h1 svg{color:var(--dsw-alias-brand-primary,#5b8cff);flex:none}',
          '.inb-sub{background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.06));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:999px;padding:2px 12px;color:var(--dsw-alias-label-secondary,#9aa0aa);font-size:12px;font-variant-numeric:tabular-nums}',
          '.inb-hbtns{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
          '.inb-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;cursor:pointer;color:var(--dsw-alias-label-secondary,#9aa0aa);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.05));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-radius:9px;padding:6px 12px;transition:color .15s ease,border-color .15s ease,background .15s ease}',
          '.inb-btn:hover:enabled{color:var(--dsw-alias-label-primary,#e6e6e6);border-color:var(--dsw-alias-border-l3,rgba(255,255,255,.24));background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.06))}',
          '.inb-btn:disabled{opacity:.5;cursor:default}',
          '.inb-btn.primary{color:#fff;background:linear-gradient(135deg,#4d8dff,#7a6bff);border:0;font-weight:600}',
          '.inb-btn.primary:hover:enabled{filter:brightness(1.08)}',
          '.inb-toolbar{flex:none;max-width:1180px;width:100%;margin:0 auto;padding:6px clamp(18px,2.8cqi,40px) 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
          '.inb-tabs{display:flex;align-items:center;gap:4px;background:var(--dsw-alias-bg-layer-1,rgba(255,255,255,.03));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:11px;padding:3px}',
          '.inb-tab{font:inherit;font-size:12.5px;cursor:pointer;color:var(--dsw-alias-label-secondary,#9aa0aa);background:transparent;border:0;border-radius:8px;padding:5px 12px;display:inline-flex;align-items:center;gap:6px}',
          '.inb-tab:hover{color:var(--dsw-alias-label-primary,#e6e6e6)}',
          '.inb-tab.active{color:var(--dsw-alias-label-primary,#e6e6e6);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.09));box-shadow:0 1px 3px rgba(0,0,0,.2)}',
          '.inb-tab-dot{width:7px;height:7px;border-radius:50%;flex:none}',
          '.inb-tab-count{font-size:11px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-brand-primary,#6ea8ff);background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d8dff) 16%,transparent);border-radius:999px;padding:0 6px}',
          '.inb-select,.inb-search{font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary,#e6e6e6);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.05));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-radius:9px;padding:6px 10px;outline:none}',
          '.inb-search{flex:1;min-width:140px}',
          '.inb-search:focus{border-color:var(--dsw-alias-brand-primary,#4d8dff);box-shadow:0 0 0 2px color-mix(in srgb,var(--dsw-alias-brand-primary,#4d8dff) 22%,transparent)}',
          '.inb-toggle{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;color:var(--dsw-alias-label-secondary,#9aa0aa);cursor:pointer;user-select:none;white-space:nowrap}',
          '.inb-toggle input{accent-color:var(--dsw-alias-brand-primary,#4d8dff);cursor:pointer}',
          '.inb-main{flex:1;min-height:0;display:flex;max-width:1180px;width:100%;margin:0 auto;padding:0 clamp(18px,2.8cqi,40px) 24px;gap:14px}',
          '.inb-listpane{width:min(42%,420px);min-width:260px;flex:none;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1,rgba(22,25,31,.6));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.16)}',
          '.inb-list{flex:1;min-height:0;overflow-y:auto;scrollbar-gutter:stable}',
          '.inb-row{display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.06));cursor:pointer;transition:background .14s ease;position:relative}',
          '.inb-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(255,255,255,.04))}',
          '.inb-row.active{background:color-mix(in srgb,var(--dsw-alias-brand-primary,#4d8dff) 12%,transparent)}',
          '.inb-row.unread .inb-row-subject{font-weight:700;color:var(--dsw-alias-label-primary,#e6e6e6)}',
          '.inb-avatar{flex:none;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;letter-spacing:.02em}',
          '.inb-row-mid{flex:1;min-width:0}',
          '.inb-row-top{display:flex;align-items:baseline;gap:8px}',
          '.inb-row-from{flex:1;min-width:0;font-size:12.5px;color:var(--dsw-alias-label-primary,#e6e6e6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
          '.inb-row-time{flex:none;font-size:11px;color:var(--dsw-alias-label-tertiary,#7c828c);font-variant-numeric:tabular-nums}',
          '.inb-row-subject{font-size:12.5px;color:var(--dsw-alias-label-secondary,#b6bcc6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}',
          '.inb-row-meta{display:flex;align-items:center;gap:6px;margin-top:3px;font-size:11px;color:var(--dsw-alias-label-tertiary,#7c828c)}',
          '.inb-unreaddot{position:absolute;left:4px;top:50%;transform:translateY(-50%);width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-brand-primary,#4d8dff)}',
          '.inb-chipchannel{font-size:10px;border-radius:999px;padding:0 7px;line-height:1.6;color:#fff}',
          '.inb-detailpane{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0;background:var(--dsw-alias-bg-layer-1,rgba(22,25,31,.55));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,.16)}',
          '.inb-detail-empty{flex:1;display:flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-tertiary,#7c828c);font-size:13px;padding:24px;text-align:center}',
          '.inb-detail-scroll{flex:1;min-height:0;overflow-y:auto;padding:20px clamp(16px,2.4cqi,26px)}',
          '.inb-dhead{display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}',
          '.inb-dtitle{flex:1;min-width:0;margin:0;font-size:17px;font-weight:700;line-height:1.4;overflow-wrap:anywhere}',
          '.inb-dactions{display:flex;gap:6px;flex-wrap:wrap}',
          '.inb-dmeta{margin-top:10px;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--dsw-alias-label-secondary,#9aa0aa)}',
          '.inb-dmeta b{color:var(--dsw-alias-label-primary,#e6e6e6);font-weight:600}',
          '.inb-dbody{margin-top:18px;padding-top:16px;border-top:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08))}',
          '.inb-body-text{white-space:pre-wrap;overflow-wrap:anywhere;font-family:inherit;font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary,#e0e4ea);margin:0}',
          '.inb-body-html{font-size:13px;line-height:1.7;color:var(--dsw-alias-label-primary,#e0e4ea);overflow-wrap:anywhere}',
          '.inb-body-html img{max-width:100%;height:auto}',
          '.inb-body-html a{color:var(--dsw-alias-brand-primary,#6ea8ff)}',
          '.inb-attach{margin-top:16px;display:flex;flex-direction:column;gap:6px}',
          '.inb-attach-title{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dsw-alias-label-tertiary,#7c828c)}',
          '.inb-attach-item{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--dsw-alias-label-secondary,#b6bcc6);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.05));border:1px solid var(--dsw-alias-border-l1,rgba(255,255,255,.08));border-radius:9px;padding:6px 10px;max-width:100%}',
          '.inb-attach-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
          '.inb-list-empty{padding:40px 20px;text-align:center;color:var(--dsw-alias-label-tertiary,#7c828c);font-size:12.5px}',
          '.inb-spinner{display:inline-block;width:12px;height:12px;border:2px solid color-mix(in srgb,currentColor 30%,transparent);border-top-color:currentColor;border-radius:50%;animation:inb-spin .8s linear infinite}',
          '@keyframes inb-spin{to{transform:rotate(360deg)}}',
          '/* settings */',
          '.inb-settings{flex:1;min-height:0;overflow-y:auto;max-width:1180px;width:100%;margin:0 auto;padding:0 clamp(18px,2.8cqi,40px) 32px}',
          '.inb-scard{background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015)),var(--dsw-alias-bg-layer-1,rgba(22,25,31,.72));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.12));border-radius:16px;padding:16px 18px;margin-bottom:14px;box-shadow:0 8px 24px rgba(0,0,0,.16)}',
          '.inb-scard-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px}',
          '.inb-scard-title{font-size:14px;font-weight:700;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
          '.inb-badge{font-size:11px;border-radius:999px;padding:1px 9px;color:#fff}',
          '.inb-sline{font-size:12px;color:var(--dsw-alias-label-secondary,#9aa0aa);margin:2px 0}',
          '.inb-sline.err{color:var(--dsw-alias-state-error-primary,#ff6b6b)}',
          '.inb-sform{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px;margin-top:6px}',
          '.inb-field{display:flex;flex-direction:column;gap:5px;min-width:0}',
          '.inb-field-label{font-size:11px;color:var(--dsw-alias-label-secondary,#9aa0aa)}',
          '.inb-field-input{width:100%;box-sizing:border-box;font:inherit;font-size:12.5px;color:var(--dsw-alias-label-primary,#e6e6e6);background:var(--dsw-alias-bg-layer-2,rgba(255,255,255,.05));border:1px solid var(--dsw-alias-border-l2,rgba(255,255,255,.14));border-radius:9px;padding:7px 10px;outline:none}',
          '.inb-field-input:focus{border-color:var(--dsw-alias-brand-primary,#4d8dff)}',
          '.inb-help{margin-top:10px;font-size:11px;line-height:1.65;color:var(--dsw-alias-label-tertiary,#7c828c)}',
          '.inb-sactions{display:flex;align-items:center;gap:10px;margin-top:14px;flex-wrap:wrap}',
          '.inb-notice{font-size:11.5px;color:var(--dsw-alias-label-secondary,#9aa0aa)}',
          '.inb-notice.err{color:var(--dsw-alias-state-error-primary,#ff6b6b)}',
          '.inb-notice.ok{color:var(--dsw-alias-state-success-primary,#3ecf8e)}',
          '@container inb (width<=720px){.inb-main{flex-direction:column}.inb-listpane{width:100%;max-width:none;min-width:0} .inb-detailpane{display:none} .inb-main.has-selection .inb-listpane{display:none} .inb-main.has-selection .inb-detailpane{display:flex} .inb-sform{grid-template-columns:1fr}}',
        ].join('\n')
        document.head.appendChild(el)
      }

      // -------------------------------------------------------------------
      // helpers
      // -------------------------------------------------------------------
      function pad2(n) { return n < 10 ? '0' + n : String(n) }
      function fmtTime(ms, t) {
        if (!ms) return ''
        var d = new Date(ms)
        var now = new Date()
        if (d.toDateString() === now.toDateString()) return pad2(d.getHours()) + ':' + pad2(d.getMinutes())
        var y = new Date(now); y.setDate(y.getDate() - 1)
        if (d.toDateString() === y.toDateString()) return t('time.yesterday')
        if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '/' + d.getDate()
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
      }
      function fmtFull(ms) {
        if (!ms) return ''
        var d = new Date(ms)
        return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes())
      }
      function fmtSize(n) {
        if (typeof n !== 'number' || n <= 0) return ''
        if (n < 1024) return n + ' B'
        if (n < 1048576) return (n / 1024).toFixed(1) + ' KB'
        return (n / 1048576).toFixed(1) + ' MB'
      }
      function initialOf(msg) {
        var s = (msg.fromName || msg.fromAddr || '?').trim()
        return s.slice(0, 1).toUpperCase()
      }
      function displayFrom(msg) {
        return msg.fromName || msg.fromAddr || '(未知发件人)'
      }
      function sanitizeHtml(html) {
        try {
          if (typeof DOMParser === 'undefined') return ''
          var doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
          var bad = doc.querySelectorAll('script,style,iframe,object,embed,form,link,meta,base')
          for (var i = 0; i < bad.length; i++) bad[i].remove()
          var all = doc.querySelectorAll('*')
          for (var j = 0; j < all.length; j++) {
            var attrs = Array.prototype.slice.call(all[j].attributes || [])
            for (var k = 0; k < attrs.length; k++) {
              var name = (attrs[k].name || '').toLowerCase()
              if (name.indexOf('on') === 0 || name === 'srcdoc') all[j].removeAttribute(attrs[k].name)
            }
          }
          return doc.body ? doc.body.innerHTML : ''
        } catch (e) { return '' }
      }

      var DEFAULT_HOST = { gmail: 'imap.gmail.com', qqmail: 'imap.qq.com' }

      function emptyForm() {
        return { id: '', channel: 'gmail', email: '', password: '', label: '', imapHost: 'imap.gmail.com', imapPort: 993 }
      }

      async function api(payload) {
        var res = await fetch('api/dsh-inbox/state', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        return res.json()
      }

      function createIcon() {
        function Icon(props) {
          var size = props && typeof props.size === 'number' ? props.size : 16
          return h('svg', {
            width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
            strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true',
          }, [
            h('rect', { key: 'r', x: 3, y: 5, width: 18, height: 14, rx: 3 }),
            h('path', { key: 'f', d: 'M4 7.5l7.2 5.1a1.4 1.4 0 0 0 1.6 0L20 7.5' }),
            h('path', { key: 'l', d: 'M8 14.5h4' }),
          ])
        }
        Icon.displayName = 'InboxNavIcon'
        return Icon
      }

      function createPanel(ctx, t) {
        function Panel() {
          var dataState = React.useState({ accounts: [], messages: [], total: 0, unreadCount: 0, sync: { running: false, byAccount: {} } })
          var data = dataState[0]
          var setData = dataState[1]
          var loadedState = React.useState(false)
          var loaded = loadedState[0]
          var setLoaded = loadedState[1]
          var refreshingState = React.useState(false)
          var refreshing = refreshingState[0]
          var setRefreshing = refreshingState[1]
          var channelState = React.useState('all')
          var channel = channelState[0]
          var setChannel = channelState[1]
          var accountFilterState = React.useState('all')
          var accountFilter = accountFilterState[0]
          var setAccountFilter = accountFilterState[1]
          var searchState = React.useState('')
          var search = searchState[0]
          var setSearch = searchState[1]
          var unreadOnlyState = React.useState(false)
          var unreadOnly = unreadOnlyState[0]
          var setUnreadOnly = unreadOnlyState[1]
          var selectedState = React.useState(null)
          var selectedId = selectedState[0]
          var setSelectedId = selectedState[1]
          var bodyState = React.useState({ id: null, loading: false, value: null, error: null })
          var body = bodyState[0]
          var setBody = bodyState[1]
          var settingsState = React.useState(false)
          var settingsOpen = settingsState[0]
          var setSettingsOpen = settingsState[1]
          var formState = React.useState(emptyForm())
          var form = formState[0]
          var setForm = formState[1]
          var noticeState = React.useState({ text: '', kind: '' })
          var notice = noticeState[0]
          var setNotice = noticeState[1]
          var busyState = React.useState(false)
          var busy = busyState[0]
          var setBusy = busyState[1]
          var bodyCacheRef = React.useRef({})

          function applySnapshot(value) {
            if (value && typeof value === 'object') {
              setData({
                accounts: Array.isArray(value.accounts) ? value.accounts : [],
                messages: Array.isArray(value.messages) ? value.messages : [],
                total: typeof value.total === 'number' ? value.total : 0,
                unreadCount: typeof value.unreadCount === 'number' ? value.unreadCount : 0,
                sync: value.sync && typeof value.sync === 'object' ? value.sync : { running: false, byAccount: {} },
              })
            }
          }

          React.useEffect(function () {
            var alive = true
            api({ op: 'get' }).then(function (json) {
              if (!alive) return
              if (json && json.ok) applySnapshot(json.value)
              setLoaded(true)
            }).catch(function () { if (alive) setLoaded(true) })
            var timer = setInterval(function () {
              if (!alive) return
              api({ op: 'get' }).then(function (json) { if (alive && json && json.ok) applySnapshot(json.value) }).catch(function () {})
            }, 20000)
            return function () { alive = false; clearInterval(timer) }
          }, [])

          var messages = data.messages

          function findMessage(id) {
            for (var i = 0; i < messages.length; i++) if (messages[i].id === id) return messages[i]
            return null
          }

          var selected = selectedId ? findMessage(selectedId) : null

          React.useEffect(function () {
            if (!selectedId) { setBody({ id: null, loading: false, value: null, error: null }); return }
            var msg = findMessage(selectedId)
            if (!msg) { setBody({ id: selectedId, loading: false, value: null, error: 'message not found' }); return }
            if (bodyCacheRef.current[selectedId]) {
              setBody({ id: selectedId, loading: false, value: bodyCacheRef.current[selectedId], error: null })
              return
            }
            var alive = true
            setBody({ id: selectedId, loading: true, value: null, error: null })
            api({ op: 'body', accountId: msg.accountId, uid: msg.uid, uidValidity: msg.uidValidity }).then(function (json) {
              if (!alive) return
              if (json && json.ok && json.value) {
                bodyCacheRef.current[selectedId] = json.value
                setBody({ id: selectedId, loading: false, value: json.value, error: null })
              } else {
                setBody({ id: selectedId, loading: false, value: null, error: (json && json.error && json.error.message) || '加载失败' })
              }
            }).catch(function (error) {
              if (alive) setBody({ id: selectedId, loading: false, value: null, error: String(error) })
            })
            return function () { alive = false }
          }, [selectedId, messages.length])

          function refresh() {
            if (refreshing) return
            setRefreshing(true)
            api({ op: 'refresh' }).then(function (json) {
              if (json && json.ok) applySnapshot(json.value)
            }).catch(function () {}).then(function () { setRefreshing(false) })
          }

          function openMessage(msg) {
            setSelectedId(msg.id)
            if (!msg.seen) {
              api({ op: 'mark', id: msg.id, read: true }).then(function (json) {
                if (json && json.ok) applySnapshot(json.value)
              }).catch(function () {})
            }
          }

          function toggleRead(msg) {
            api({ op: 'mark', id: msg.id, read: !msg.seen }).then(function (json) {
              if (json && json.ok) applySnapshot(json.value)
            }).catch(function () {})
          }

          // ---- settings actions ----
          function openSettings() {
            setNotice({ text: '', kind: '' })
            setForm(emptyForm())
            setSettingsOpen(true)
          }
          function editAccount(acc) {
            setForm({ id: acc.id, channel: acc.channel, email: acc.email, password: '', label: acc.label, imapHost: acc.imapHost, imapPort: acc.imapPort })
            setNotice({ text: '', kind: '' })
          }
          function setField(key, value) {
            setForm(function (cur) {
              var next = {}
              for (var k in cur) next[k] = cur[k]
              next[key] = value
              if (key === 'channel') {
                next.imapHost = DEFAULT_HOST[value] || next.imapHost
                next.imapPort = 993
              }
              return next
            })
          }
          function isEmail(v) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((v || '').trim()) }

          function testAccount() {
            if (!isEmail(form.email)) { setNotice({ text: t('settings.needEmail'), kind: 'err' }); return }
            if (!form.password && !form.id) { setNotice({ text: t('settings.needPassword'), kind: 'err' }); return }
            setBusy(true); setNotice({ text: t('settings.testing'), kind: '' })
            api({ op: 'testAccount', account: { id: form.id, channel: form.channel, email: form.email, imapHost: form.imapHost, imapPort: Number(form.imapPort) }, password: form.password }).then(function (json) {
              var r = json && json.value ? json.value : { ok: false, detail: 'no response' }
              if (r.ok) setNotice({ text: t('settings.testOk', { n: r.exists || 0 }), kind: 'ok' })
              else setNotice({ text: t('settings.testFail', { msg: r.detail || '' }), kind: 'err' })
            }).catch(function (error) { setNotice({ text: t('settings.testFail', { msg: String(error) }), kind: 'err' }) })
              .then(function () { setBusy(false) })
          }

          function saveAccount() {
            if (!isEmail(form.email)) { setNotice({ text: t('settings.needEmail'), kind: 'err' }); return }
            if (!form.password && !form.id) { setNotice({ text: t('settings.needPassword'), kind: 'err' }); return }
            setBusy(true)
            var payload = {
              op: 'saveAccount',
              account: { id: form.id || undefined, channel: form.channel, email: form.email, label: form.label, imapHost: form.imapHost, imapPort: Number(form.imapPort) },
              password: form.password || undefined,
            }
            api(payload).then(function (json) {
              if (json && json.ok) {
                applySnapshot(json.value)
                setForm(emptyForm())
                setNotice({ text: t('settings.saved'), kind: 'ok' })
              } else {
                setNotice({ text: t('settings.saveFailed', { msg: (json && json.error && json.error.message) || '' }), kind: 'err' })
              }
            }).catch(function (error) { setNotice({ text: t('settings.saveFailed', { msg: String(error) }), kind: 'err' }) })
              .then(function () { setBusy(false) })
          }

          function deleteAccount(acc) {
            var okDel = true
            try { okDel = window.confirm(t('settings.deleteConfirm', { label: acc.label })) } catch (e) { okDel = true }
            if (!okDel) return
            api({ op: 'deleteAccount', id: acc.id }).then(function (json) {
              if (json && json.ok) {
                applySnapshot(json.value)
                if (form.id === acc.id) setForm(emptyForm())
                setNotice({ text: t('settings.deleted'), kind: 'ok' })
              }
            }).catch(function () {})
          }

          // ---- derived list ----
          var filtered = messages.filter(function (m) {
            if (channel !== 'all' && m.channel !== channel) return false
            if (accountFilter !== 'all' && m.accountId !== accountFilter) return false
            if (unreadOnly && m.seen) return false
            if (search) {
              var q = search.toLowerCase()
              var hay = ((m.subject || '') + ' ' + (m.fromName || '') + ' ' + (m.fromAddr || '')).toLowerCase()
              if (hay.indexOf(q) === -1) return false
            }
            return true
          })

          function channelUnread(ch) {
            var n = 0
            for (var i = 0; i < messages.length; i++) {
              var m = messages[i]
              if (!m.seen && (ch === 'all' || m.channel === ch)) n++
            }
            return n
          }

          // ---- render helpers ----
          function renderTabs() {
            var tabs = [['all', t('tab.all')], ['gmail', t('tab.gmail')], ['qqmail', t('tab.qqmail')]]
            return h('div', { className: 'inb-tabs', key: 'tabs' }, tabs.map(function (pair) {
              var key = pair[0]
              var n = channelUnread(key)
              return h('button', {
                key: key, type: 'button', className: 'inb-tab' + (channel === key ? ' active' : ''),
                onClick: function () { setChannel(key); setAccountFilter('all') },
              }, [
                (key !== 'all') ? h('span', { key: 'd', className: 'inb-tab-dot', style: { background: CHANNEL_META[key].color } }) : null,
                h('span', { key: 'l' }, pair[1]),
                n > 0 ? h('span', { key: 'c', className: 'inb-tab-count' }, String(n)) : null,
              ])
            }))
          }

          function renderToolbar() {
            var accountOptions = [h('option', { key: 'all', value: 'all' }, t('filter.allAccounts'))]
            data.accounts.forEach(function (acc) {
              accountOptions.push(h('option', { key: acc.id, value: acc.id }, acc.label + ' · ' + acc.email))
            })
            return h('div', { className: 'inb-toolbar', key: 'toolbar' }, [
              renderTabs(),
              h('select', {
                key: 'account', className: 'inb-select', value: accountFilter,
                onChange: function (e) { setAccountFilter(e.target.value) },
              }, accountOptions),
              h('input', {
                key: 'search', className: 'inb-search', placeholder: t('filter.search'), value: search,
                onChange: function (e) { setSearch(e.target.value) },
              }),
              h('label', { key: 'unread', className: 'inb-toggle' }, [
                h('input', { key: 'i', type: 'checkbox', checked: unreadOnly, onChange: function (e) { setUnreadOnly(e.target.checked) } }),
                h('span', { key: 's' }, t('filter.unread')),
              ]),
            ])
          }

          function renderRow(msg) {
            var meta = CHANNEL_META[msg.channel] || { label: msg.channel, color: '#888' }
            var acc = null
            for (var i = 0; i < data.accounts.length; i++) if (data.accounts[i].id === msg.accountId) { acc = data.accounts[i]; break }
            var snippetBits = []
            if (msg.hasAttachments) snippetBits.push('📎')
            if (msg.size) snippetBits.push(fmtSize(msg.size))
            return h('div', {
              key: msg.id, className: 'inb-row' + (msg.seen ? '' : ' unread') + (msg.id === selectedId ? ' active' : ''),
              onClick: function () { openMessage(msg) },
            }, [
              !msg.seen ? h('span', { key: 'dot', className: 'inb-unreaddot' }) : null,
              h('div', { key: 'av', className: 'inb-avatar', style: { background: meta.color } }, initialOf(msg)),
              h('div', { key: 'mid', className: 'inb-row-mid' }, [
                h('div', { key: 'top', className: 'inb-row-top' }, [
                  h('span', { key: 'from', className: 'inb-row-from' }, displayFrom(msg)),
                  h('span', { key: 'time', className: 'inb-row-time' }, fmtTime(msg.date, t)),
                ]),
                h('div', { key: 'subj', className: 'inb-row-subject' }, msg.subject || '(无主题)'),
                h('div', { key: 'meta', className: 'inb-row-meta' }, [
                  h('span', { key: 'ch', className: 'inb-chipchannel', style: { background: meta.color } }, meta.label),
                  acc ? h('span', { key: 'acc' }, acc.label) : null,
                  snippetBits.length ? h('span', { key: 'snip' }, '· ' + snippetBits.join(' ')) : null,
                ]),
              ]),
            ])
          }

          function renderList() {
            var children = []
            if (!loaded) {
              children.push(h('div', { key: 'loading', className: 'inb-list-empty' }, h('span', { className: 'inb-spinner' })))
            } else if (data.accounts.length === 0) {
              children.push(h('div', { key: 'noacc', className: 'inb-list-empty' }, t('empty.noAccount')))
            } else if (filtered.length === 0) {
              children.push(h('div', { key: 'empty', className: 'inb-list-empty' }, messages.length === 0 ? t('empty.none') : t('empty.filtered')))
            } else {
              filtered.forEach(function (msg) { children.push(renderRow(msg)) })
            }
            return h('div', { className: 'inb-listpane', key: 'listpane' }, [
              h('div', { key: 'list', className: 'inb-list' }, children),
            ])
          }

          function renderDetail() {
            if (!selectedId) {
              return h('div', { className: 'inb-detailpane', key: 'detail' }, [
                h('div', { key: 'empty', className: 'inb-detail-empty' }, t('detail.empty')),
              ])
            }
            var msg = selected
            var head = []
            if (msg) {
              head.push(h('div', { key: 'head', className: 'inb-dhead' }, [
                h('h3', { key: 'title', className: 'inb-dtitle' }, msg.subject || '(无主题)'),
                h('div', { key: 'actions', className: 'inb-dactions' }, [
                  h('button', { key: 'back', type: 'button', className: 'inb-btn', onClick: function () { setSelectedId(null) } }, '‹ ' + t('action.back')),
                  h('button', { key: 'read', type: 'button', className: 'inb-btn', onClick: function () { toggleRead(msg) } }, msg.seen ? t('action.markUnread') : t('action.markRead')),
                ]),
              ]))
              head.push(h('div', { key: 'meta', className: 'inb-dmeta' }, [
                h('div', { key: 'from' }, [h('b', { key: 'b' }, displayFrom(msg)), msg.fromAddr ? h('span', { key: 'a' }, ' <' + msg.fromAddr + '>') : null]),
                msg.toText ? h('div', { key: 'to' }, t('detail.to') + ': ' + msg.toText) : null,
                h('div', { key: 'date' }, fmtFull(msg.date)),
              ]))
            }
            var bodyChildren = []
            if (body && body.id === selectedId && body.loading) {
              bodyChildren.push(h('div', { key: 'loading', className: 'inb-list-empty' }, [h('span', { key: 's', className: 'inb-spinner' }), ' ' + t('detail.loading')]))
            } else if (body && body.id === selectedId && body.error) {
              bodyChildren.push(h('div', { key: 'err', className: 'inb-list-empty' }, '⚠ ' + body.error))
            } else if (body && body.id === selectedId && body.value) {
              var v = body.value
              if (v.text && v.text.trim()) {
                bodyChildren.push(h('pre', { key: 'txt', className: 'inb-body-text' }, v.text))
              } else if (v.html && v.html.trim()) {
                bodyChildren.push(h('div', { key: 'html', className: 'inb-body-html', dangerouslySetInnerHTML: { __html: sanitizeHtml(v.html) } }))
              } else {
                bodyChildren.push(h('div', { key: 'nobody', className: 'inb-list-empty' }, t('detail.noBody')))
              }
              if (Array.isArray(v.attachments) && v.attachments.length > 0) {
                bodyChildren.push(h('div', { key: 'att', className: 'inb-attach' }, [
                  h('div', { key: 't', className: 'inb-attach-title' }, t('detail.attachments')),
                ].concat(v.attachments.map(function (a, idx) {
                  return h('span', { key: 'a' + idx, className: 'inb-attach-item' }, [
                    h('span', { key: 'i' }, '📎'),
                    h('span', { key: 'n', className: 'inb-attach-name' }, a.filename || '(附件)'),
                    a.size ? h('span', { key: 's' }, '· ' + fmtSize(a.size)) : null,
                  ])
                }))))
              }
            }
            return h('div', { className: 'inb-detailpane', key: 'detail' }, [
              h('div', { key: 'scroll', className: 'inb-detail-scroll' }, head.concat([
                h('div', { key: 'body', className: 'inb-dbody' }, bodyChildren),
              ])),
            ])
          }

          function renderSettings() {
            var cards = []
            // existing accounts
            data.accounts.forEach(function (acc) {
              var meta = CHANNEL_META[acc.channel] || { label: acc.channel, color: '#888' }
              var syncInfo = data.sync && data.sync.byAccount ? data.sync.byAccount[acc.id] : null
              var lastSync = (syncInfo && syncInfo.lastSyncAt) || acc.lastSyncAt
              var lastErr = (syncInfo && syncInfo.lastError) || acc.lastError
              cards.push(h('div', { key: 'acc-' + acc.id, className: 'inb-scard' }, [
                h('div', { key: 'head', className: 'inb-scard-head' }, [
                  h('span', { key: 'badge', className: 'inb-badge', style: { background: meta.color } }, meta.label),
                  h('span', { key: 'title', className: 'inb-scard-title' }, acc.label),
                  h('button', { key: 'edit', type: 'button', className: 'inb-btn', onClick: function () { editAccount(acc) } }, t('settings.edit')),
                  h('button', { key: 'del', type: 'button', className: 'inb-btn', onClick: function () { deleteAccount(acc) } }, t('settings.delete')),
                ]),
                h('div', { key: 'email', className: 'inb-sline' }, acc.email + ' · ' + acc.imapHost + ':' + acc.imapPort),
                h('div', { key: 'sync', className: 'inb-sline' }, lastSync ? t('settings.lastSync', { time: fmtFull(lastSync) }) : t('settings.never')),
                lastErr ? h('div', { key: 'err', className: 'inb-sline err' }, t('settings.error', { msg: lastErr })) : null,
              ]))
            })

            var channelHelp = form.channel === 'qqmail' ? t('settings.help.qqmail') : t('settings.help.gmail')
            function field(label, key, value, type, placeholder) {
              return h('label', { className: 'inb-field', key: 'f-' + key }, [
                h('span', { key: 'l', className: 'inb-field-label' }, label),
                h('input', {
                  key: 'i', className: 'inb-field-input', type: type || 'text',
                  value: value === null || value === undefined ? '' : String(value),
                  placeholder: placeholder || '',
                  onChange: function (e) { setField(key, e.target.value) },
                }),
              ])
            }
            var formFields = []
            formFields.push(h('label', { key: 'channel', className: 'inb-field' }, [
              h('span', { key: 'l', className: 'inb-field-label' }, t('settings.channel')),
              h('select', { key: 's', className: 'inb-field-input', value: form.channel, onChange: function (e) { setField('channel', e.target.value) } }, [
                h('option', { key: 'gmail', value: 'gmail' }, 'Gmail'),
                h('option', { key: 'qqmail', value: 'qqmail' }, 'QQ邮箱'),
              ]),
            ]))
            formFields.push(field(t('settings.email'), 'email', form.email, 'email', 'you@gmail.com'))
            formFields.push(field(t('settings.password') + (form.id ? '（' + t('settings.passwordKeep') + '）' : ''), 'password', form.password, 'password', '••••••••'))
            formFields.push(field(t('settings.label'), 'label', form.label))
            formFields.push(field(t('settings.host'), 'imapHost', form.imapHost))
            formFields.push(field(t('settings.port'), 'imapPort', form.imapPort, 'number'))

            cards.push(h('div', { key: 'form', className: 'inb-scard' }, [
              h('div', { key: 'head', className: 'inb-scard-head' }, [
                h('span', { key: 'title', className: 'inb-scard-title' }, form.id ? t('settings.edit') : t('settings.add')),
                form.id ? h('button', { key: 'cancel', type: 'button', className: 'inb-btn', onClick: function () { setForm(emptyForm()) } }, t('settings.cancel')) : null,
              ]),
              h('div', { key: 'form', className: 'inb-sform' }, formFields),
              h('div', { key: 'help', className: 'inb-help' }, channelHelp),
              h('div', { key: 'actions', className: 'inb-sactions' }, [
                h('button', { key: 'save', type: 'button', className: 'inb-btn primary', disabled: busy, onClick: saveAccount }, busy ? t('settings.saving') : t('settings.save')),
                h('button', { key: 'test', type: 'button', className: 'inb-btn', disabled: busy, onClick: testAccount }, busy ? t('settings.testing') : t('settings.test')),
                notice.text ? h('span', { key: 'notice', className: 'inb-notice ' + notice.kind }, notice.text) : null,
              ]),
            ]))

            return h('div', { className: 'inb-settings', key: 'settings' }, cards)
          }

          // ---- assemble ----
          if (settingsOpen) {
            var settingsHeader = h('div', { className: 'inb-header', key: 'h' }, [
              h('div', { className: 'inb-titlerow', key: 't' }, [
                h('h2', { className: 'inb-h1', key: 'h1' }, [h('span', { key: 'x' }, '⚙'), h('span', { key: 's' }, t('settings.title'))]),
                h('div', { className: 'inb-hbtns', key: 'b' }, [
                  h('button', { key: 'close', type: 'button', className: 'inb-btn', onClick: function () { setSettingsOpen(false) } }, t('settings.close')),
                ]),
              ]),
            ])
            return h('section', { className: 'inb-page', 'aria-label': t('page.title') }, [settingsHeader, renderSettings()])
          }

          var header = h('div', { className: 'inb-header', key: 'header' }, [
            h('div', { className: 'inb-titlerow', key: 'title' }, [
              h('h2', { className: 'inb-h1', key: 'h1' }, [h('span', { key: 'ico' }, '▶'), h('span', { key: 'txt' }, t('page.title'))]),
              h('span', { className: 'inb-sub', key: 'sub' }, data.accounts.length === 0
                ? t('page.subtitleEmpty')
                : t('page.subtitle', { accounts: data.accounts.length, unread: data.unreadCount, total: data.total })),
              h('div', { className: 'inb-hbtns', key: 'btns' }, [
                h('button', { key: 'refresh', type: 'button', className: 'inb-btn', disabled: refreshing, onClick: refresh }, [
                  refreshing ? h('span', { key: 's', className: 'inb-spinner' }) : h('span', { key: 'i' }, '⟳'),
                  h('span', { key: 'l' }, refreshing ? t('action.refreshing') : t('action.refresh')),
                ]),
                h('button', { key: 'settings', type: 'button', className: 'inb-btn', onClick: openSettings }, [h('span', { key: 'i' }, '⚙'), h('span', { key: 'l' }, t('action.settings'))]),
              ]),
            ]),
          ])

          var mainCls = 'inb-main' + (selectedId ? ' has-selection' : '')
          return h('section', { className: 'inb-page', 'aria-label': t('page.title') }, [
            header,
            renderToolbar(),
            h('div', { className: mainCls, key: 'main' }, [renderList(), renderDetail()]),
          ])
        }

        Panel.displayName = 'InboxPanel'
        return Panel
      }

      function apply(ctx) {
        ctx.effect(function () { return ctx.locale.register(NS, { zh: ZH, en: EN }) }, 'dsh-inbox: dictionaries')
        var t = ctx.locale.bind(NS)
        injectStyles()

        var Panel = createPanel(ctx, t)
        var Icon = createIcon()

        ctx.slots.inject('main', function () {
          return ctx.slots.register({ name: 'main', key: MODULE_ID, locale: NS }, function (props) { return h(Panel, props) })
        })

        ctx.slots.inject('sidebar.panellist', function () {
          return ctx.slots.register({
            name: 'sidebar.panellist',
            id: MODULE_ID,
            order: 40,
            label: function () { return t('nav.title') },
            locale: NS,
          }, function (props) {
            return h(Icon, { size: props && typeof props.size === 'number' ? props.size : undefined })
          })
        })
      }

      module.exports = { name: MODULE_ID, inject: ['slots', 'locale'], apply: apply }
      return module.exports
    },
  })
})()
