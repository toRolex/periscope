/**
 * periscope-dsh browser half —— 视觉端点配置卡片（issue #34 + #35 生效值回显/未配置引导 + #36 连通性校验）。
 *
 * 装载面：client-modules（机制 B，spike #32 实证）。本文件是手写 CJS factory bundle，
 * 与 tsdown `clientBundle()` 产物同构：
 *   顶部 `window.__ModuleLoader__.load({ id, factory })` 仅注册 factory（惰性）；
 *   物化时执行 factory → 拿到同步 `require`，只解析平台 seed 模块（react 等）与声明的
 *   inject 边 → 返回 plugin（module.exports = { name, inject, apply }）。
 * 浏览器半区沙盒：无 JSX / import，只能 `React.createElement`。
 *
 * CSS：机制 B 装载面没有 `styles.insert` 闭包符号（该符号是 cordis-client-runner 动态包
 * 沙盒专属），按 dsh client-modules 约定以 `<style data-plugin>` 标签注入（卸载时模块系统
 * 按 data-plugin 回收）。样式只用主题 CSS 变量（--dsw-alias-*），保证双配色不破。
 *
 * 读写配置：一律经 `ctx.connection.rpc.call('/periscope', endpoint, payload)` 走 host 侧
 * connection RPC channel（#33 settings-rpc.ts，authority:loopback）——describe 读当前存储值、
 * describeEffective 读「settings user > cordis.yml base > env fallback」归并生效值、update 合并写
 * user 层。卡片不直接触碰 settings 服务，也不走 settings 网关
 * （api-proxy 的 exposedNamespaces() 白名单拒第三方命名空间，spike #32 实测阻断）。
 * #35 生效值回显：只读区展示归并生效值与每字段来源（settings/cordis.yml/env/默认），
 * 已有 cordis.yml/env 配置的用户不重复填写、能看到优先级结果；未配置（baseUrl/model 空白）时
 * 给出可操作引导（指向本卡片表单或 env 位置）。
 * #36 连接探测：卡片「测试连接」按钮经 `/periscope` `ping` 端点调 server 侧探测当前生效
 * 端点可达性（fetch/network 归 host half，浏览器沙盒不能直接发网络请求），结果回显在卡片。
 * apiKey 字段只收**环境变量名**：空允许（本地无鉴权端点可留空）；非空须匹配合法环境变量名
 * 模式（/^[A-Za-z_][A-Za-z0-9_]*$/）。形如 sk-… 的字面 key 因含连字符/点号被拒；纯字母数字
 * 的字面 key 与 env 名无法区分，属尽力而为的 UI 卫生——真正的安全边界在 server 侧：key 只从
 * apiKeyEnv 命名的环境变量读取，字面 key 永远不会进配置。
 */
window.__ModuleLoader__.load({
  id: 'periscope-dsh',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    // ── CSS：<style data-plugin> 注入（机制 B 无 styles.insert；卸载按 data-plugin 回收） ──
    if (typeof document !== 'undefined') {
      var styleTag = document.createElement('style')
      styleTag.setAttribute('data-plugin', 'periscope-dsh')
      styleTag.textContent =
        '.periscope-card{display:flex;flex-direction:column;gap:10px;padding:16px 0;' +
        'border-bottom:1px solid var(--dsw-alias-border-l2);font-size:14px;' +
        'color:var(--dsw-alias-label-primary)}' +
        '.periscope-card-title{font-weight:600;font-size:14px}' +
        '.periscope-field{display:flex;flex-direction:column;gap:4px;max-width:520px}' +
        '.periscope-label{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
        '.periscope-card input,.periscope-card select{font:inherit;padding:4px 8px;' +
        'background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);' +
        'border:1px solid var(--dsw-alias-border-l2);border-radius:6px}' +
        '.periscope-actions{display:flex;gap:8px}' +
        '.periscope-card button{font:inherit;padding:4px 12px;cursor:pointer;border-radius:6px;' +
        'border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-module-platform);' +
        'color:var(--dsw-alias-label-primary)}' +
        '.periscope-card button:disabled{opacity:.5;cursor:default}' +
        '.periscope-hint,.periscope-msg{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
        '.periscope-error{font-size:12px;color:var(--dsw-alias-label-error)}' +
        '.periscope-effective{display:flex;flex-direction:column;gap:6px;padding:10px 12px;' +
        'border:1px solid var(--dsw-alias-border-l2);border-radius:8px;margin-bottom:12px;' +
        'max-width:520px}' +
        '.periscope-effective-row{display:flex;gap:8px;align-items:baseline;font-size:13px;' +
        'flex-wrap:wrap}' +
        '.periscope-effective-value{font-family:var(--dsw-alias-font-mono,monospace);' +
        'word-break:break-all}' +
        '.periscope-effective-source{font-size:11px;color:var(--dsw-alias-label-secondary);' +
        'border:1px solid var(--dsw-alias-border-l2);border-radius:4px;padding:0 4px}' +
        '.periscope-guidance{font-size:12px;color:var(--dsw-alias-label-secondary);' +
        'background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);' +
        'border-radius:6px;padding:6px 8px}' +
        // #36 连接探测结果：可达用主文本色、不可达用错误色（复用既有 CSS 变量）。
        '.periscope-msg[data-ping-result="reachable"]{color:var(--dsw-alias-label-primary)}' +
        '.periscope-msg[data-ping-result="unreachable"]{color:var(--dsw-alias-label-error)}'
      document.head.appendChild(styleTag)
    }

    // ── 纯逻辑（离线可测，Seam 2 经卡片行为黑盒断言） ────────────────────────────────

    /** 合法环境变量名：字母/下划线开头，仅含字母/数字/下划线。 */
    var ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

    /** 空表单（describe 未就绪 / 未注册时兜底）。 */
    function emptyForm() {
      return { protocol: 'openai', baseUrl: '', model: '', apiKeyEnv: '' }
    }

    /**
     * apiKey 字段校验：空允许（本地无鉴权端点可留空）；非空须匹配合法环境变量名模式
     * （/^[A-Za-z_][A-Za-z0-9_]*$/）。形如 sk-… 的字面 key 因含连字符/点号被拒；
     * 纯字母数字字面 key 与 env 名无法区分，属尽力而为的 UI 卫生，不构成安全边界。
     */
    function validateApiKeyEnv(value) {
      if (value === '') return ''
      if (!ENV_NAME_RE.test(value)) {
        return '不是合法环境变量名（只含字母/数字/下划线、不以数字开头）；字面 API key 不会被保存'
      }
      return ''
    }

    /**
     * describe 结果 → 表单初值：只取 settings **user 层**存储值（read.user），不预填
     * base/cordis.yml 来源。若从 resolved 值预填，一次保存会把 cordis.yml 的非空字段
     * 复制进 user 层并永久遮蔽 cordis 后续修改（review 发现的 Spec 隐患）；生效的归并值
     * 由 describeEffective 只读区回显，表单保持「仅 user 层 + 空」即可。
     */
    function formFromRead(read) {
      if (!read || read.ok !== true || !read.value || read.value.registered === false) {
        return emptyForm()
      }
      var user = read.value.user
      if (!user || typeof user !== 'object') return emptyForm()
      return {
        protocol: user.protocol || 'openai',
        baseUrl: typeof user.baseUrl === 'string' ? user.baseUrl : '',
        model: typeof user.model === 'string' ? user.model : '',
        apiKeyEnv: typeof user.apiKeyEnv === 'string' ? user.apiKeyEnv : '',
      }
    }

    /** 表单 → update patch：四字段完整快照（空串 = 清掉该字段的 user 层覆盖，回落更低来源）。 */
    function patchFromForm(form) {
      return {
        protocol: form.protocol,
        baseUrl: form.baseUrl,
        model: form.model,
        apiKeyEnv: form.apiKeyEnv,
      }
    }

    /** 不可变改单字段（新对象，供 React 重渲染）。 */
    function withField(form, field, value) {
      var next = { protocol: form.protocol, baseUrl: form.baseUrl, model: form.model, apiKeyEnv: form.apiKeyEnv }
      next[field] = value
      return next
    }

    // ── 渲染助手（React.createElement，无 JSX） ─────────────────────────────────────

    function renderProtocolSelect(protocol, onChange) {
      return React.createElement('label', { className: 'periscope-field' },
        React.createElement('span', { className: 'periscope-label' }, '协议（请求形状）'),
        React.createElement('select', {
          'data-field': 'protocol',
          value: protocol,
          onChange: function (e) { onChange('protocol', e.target.value) },
        },
          React.createElement('option', { value: 'openai' }, 'openai'),
          React.createElement('option', { value: 'anthropic' }, 'anthropic'),
          React.createElement('option', { value: 'responses' }, 'responses'),
        ),
      )
    }

    function renderTextField(field, label, value, placeholder, onChange, opts) {
      var options = opts || {}
      return React.createElement('label', { className: 'periscope-field' },
        React.createElement('span', { className: 'periscope-label' }, label),
        React.createElement('input', {
          'data-field': field,
          type: 'text',
          value: value,
          placeholder: placeholder,
          onChange: function (e) { onChange(field, e.target.value) },
        }),
        options.hint
          ? React.createElement('span', { className: 'periscope-hint' }, options.hint)
          : null,
        options.error
          ? React.createElement('span', { className: 'periscope-error', 'data-error': field }, options.error)
          : null,
      )
    }

    function renderApiKeyEnvField(value, error, onChange) {
      return renderTextField('apiKeyEnv', 'apiKey 环境变量名', value, 'PERISCOPE_API_KEY', onChange, {
        hint: '只填环境变量名（如 PERISCOPE_API_KEY），不填字面 key；本地无鉴权端点可留空',
        error: error,
      })
    }

    function errorTextOf(res) {
      if (res && res.error) {
        if (typeof res.error.message === 'string' && res.error.message !== '') return res.error.message
        var json = JSON.stringify(res.error)
        if (json && json !== '{}') return json
      }
      return '未知错误'
    }

    // ── #35 生效值回显（describeEffective：settings > cordis.yml > env 归并结果） ──

    /** 来源标记 → 可读文案（对齐 server 侧 PeriscopeEffectiveSource）。 */
    function sourceLabel(source) {
      if (source === 'settings') return 'settings'
      if (source === 'cordis') return 'cordis.yml'
      if (source === 'env') return '环境变量'
      return '默认'
    }

    /** 生效配置单字段行：label + 值 + 来源标记。空值显示占位符 —（区别于未渲染）。 */
    function renderEffectiveField(field, label, value, source) {
      return React.createElement('div', { className: 'periscope-effective-row' },
        React.createElement('span', { className: 'periscope-label' }, label),
        React.createElement('span', { 'data-effective-field': field, className: 'periscope-effective-value' },
          value === '' ? '—' : value),
        React.createElement('span', { 'data-effective-source': field, className: 'periscope-effective-source' },
          sourceLabel(source)),
      )
    }

    /**
     * 生效配置只读区：展示 describeEffective 的归并生效值（settings > cordis.yml > env 优先级）
     * 与每字段来源标记；未配置（configured:false）时给出可操作引导（指向本卡片表单或 env 位置）。
     * settings 服务不可用（registered:false）时提示来源为 cordis.yml/env；describeEffective 失败
     * （effective 为 null）时不渲染本区、不阻断表单。
     */
    function renderEffectiveSection(effective) {
      if (!effective) return null
      if (effective.registered === false) {
        return React.createElement('div', { className: 'periscope-effective', 'data-effective-card': true },
          React.createElement('div', { className: 'periscope-label' }, '当前生效配置'),
          React.createElement('div', { className: 'periscope-hint', 'data-effective-note': true },
            'settings 服务不可用：生效配置来自 cordis.yml 与 env；本卡片保存不可用（需 settings 服务就绪）'),
        )
      }
      var e = effective.value
      return React.createElement('div', { className: 'periscope-effective', 'data-effective-card': true },
        React.createElement('div', { className: 'periscope-label' }, '当前生效配置（优先级 settings > cordis.yml > env）'),
        renderEffectiveField('protocol', '协议', e.protocol, effective.sources.protocol),
        renderEffectiveField('baseUrl', 'Base URL', e.baseUrl, effective.sources.baseUrl),
        renderEffectiveField('model', '模型', e.model, effective.sources.model),
        renderEffectiveField('apiKeyEnv', 'apiKey 环境变量名', e.apiKeyEnv, effective.sources.apiKeyEnv),
        effective.configured ? null : React.createElement('div', {
          className: 'periscope-guidance',
          'data-guidance': true,
        }, '视觉端点未配置：请在下方表单填写（保存后写入 settings，优先级最高），或 export ' +
          'PERISCOPE_VISION_BASE_URL / PERISCOPE_VISION_MODEL（apiKey 仅从环境变量读取，默认 ' +
          'PERISCOPE_API_KEY）'),
      )
    }

    // ── 卡片组件：staged form（save / discard），读写经 connection RPC channel ──────

    /**
     * 视觉端点配置卡片。挂载时经 rpc.call('/periscope', 'describe', null) 读当前存储值；
     * 保存经 rpc.call('/periscope', 'update', { patch }) 合并写 user 层；discard 还原为
     * 最近加载/保存的值。connection 引用经 slots.register 的 inject face 以 props 注入
     * （卡片无法 import 模块，也不用组件函数上的共享可变模块态）。
     */
    function VisionEndpointCard(props) {
      var conn = props.connection

      var loadedState = React.useState(null)
      var loaded = loadedState[0]
      var setLoaded = loadedState[1]
      var draftState = React.useState(null)
      var draft = draftState[0]
      var setDraft = draftState[1]
      // 全局消息：{ status, text } 结构化（status 三态 saved/busy/error，供样式与测试锚点；
      // 状态不依赖文案，改文案不破坏状态判定）。null = 无消息。
      var msgState = React.useState(null)
      var msg = msgState[0]
      var setMsg = msgState[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var effectiveState = React.useState(null)
      var effective = effectiveState[0]
      var setEffective = effectiveState[1]
      // #36 连接探测：ping 结果（null | { ok, text, hint? }）与探测中状态（与保存 busy 互不阻塞）。
      var pingState = React.useState(null)
      var ping = pingState[0]
      var setPing = pingState[1]
      var pingingState = React.useState(false)
      var pinging = pingingState[0]
      var setPinging = pingingState[1]

      React.useEffect(function () {
        var cancelled = false
        Promise.resolve(conn.rpc.call('/periscope', 'describe', null))
          .then(function (res) {
            if (cancelled) return
            var form = formFromRead(res)
            setLoaded(form)
            setDraft(form)
          })
          .catch(function (e) {
            if (cancelled) return
            setMsg({ status: 'error', text: '读取配置失败：' + (e && e.message ? e.message : String(e)) })
          })
        // 归并生效值（settings > cordis.yml > env）供只读回显；失败不阻断表单。
        Promise.resolve(conn.rpc.call('/periscope', 'describeEffective', null))
          .then(function (res) {
            if (cancelled) return
            if (res && res.ok) setEffective(res.value)
          })
          .catch(function () {})
        return function () { cancelled = true }
      }, [])

      if (draft === null) {
        return React.createElement('div', { className: 'periscope-card', 'data-periscope-card': true },
          React.createElement('div', { 'data-status': 'loading' }, '加载中…'))
      }

      var apiKeyError = validateApiKeyEnv(draft.apiKeyEnv)

      function onChange(field, value) {
        setDraft(withField(draft, field, value))
        setMsg(null)
        // #36：探测的是已保存配置；草稿被编辑后旧探测结果失效，清空避免误以为新草稿已被探测。
        setPing(null)
      }

      function onSave() {
        if (busy) return
        // 非法 apiKeyEnv 由字段内联错误提示展示，这里不再写全局 msg（避免同一错误两处重复）。
        if (validateApiKeyEnv(draft.apiKeyEnv)) return
        setBusy(true)
        setMsg({ status: 'busy', text: '保存中…' })
        Promise.resolve(conn.rpc.call('/periscope', 'update', { patch: patchFromForm(draft) }))
          .then(function (res) {
            setBusy(false)
            if (res && res.ok) {
              setLoaded(draft)
              setMsg({ status: 'saved', text: '已保存' })
              // 保存已改写 user 层：重读归并生效值，让「当前生效配置」只读区与刚写入的新值同步。
              Promise.resolve(conn.rpc.call('/periscope', 'describeEffective', null))
                .then(function (effRes) {
                  if (effRes && effRes.ok) setEffective(effRes.value)
                })
                .catch(function () {})
              // 保存后当前生效配置变更，旧的探测结果已过时，清空待下次探测。
              setPing(null)
            } else {
              setMsg({ status: 'error', text: '保存失败：' + errorTextOf(res) })
            }
          })
          .catch(function (e) {
            setBusy(false)
            setMsg({ status: 'error', text: '保存失败：' + (e && e.message ? e.message : String(e)) })
          })
      }

      function onDiscard() {
        if (busy) return
        setDraft(loaded || emptyForm())
        setMsg(null)
      }

      /**
       * #36 连接探测：经 connection RPC channel 调 server 侧 /periscope ping 端点。
       * server 侧用当前生效配置（settings > cordis.yml > env 归并）发起对端点的探测
       * （网络请求归 host half），结果经 value 回传：v.ok 可达 / v.ok=false 不可达（带
       * 可操作提示 v.hint）；RPC 层错误折叠为「探测失败」文案。探测不可达是正常结果，
       * 不写入全局 msg（避免与保存消息混用状态），独立回显在卡片上。
       */
      function onPing() {
        if (pinging || busy) return
        setPinging(true)
        setPing(null)
        Promise.resolve(conn.rpc.call('/periscope', 'ping', null))
          .then(function (res) {
            setPinging(false)
            if (res && res.ok && res.value) {
              var v = res.value
              if (v && v.ok) {
                setPing({ ok: true, text: v.message })
              } else {
                setPing({ ok: false, text: v && v.message ? v.message : '端点不可达', hint: v && v.hint })
              }
            } else {
              setPing({ ok: false, text: '探测失败：' + errorTextOf(res) })
            }
          })
          .catch(function (e) {
            setPinging(false)
            setPing({ ok: false, text: '探测失败：' + (e && e.message ? e.message : String(e)) })
          })
      }

      return React.createElement('div', { className: 'periscope-card', 'data-periscope-card': true },
        React.createElement('div', { className: 'periscope-card-title' }, 'periscope 视觉端点'),
        renderEffectiveSection(effective),
        renderProtocolSelect(draft.protocol, onChange),
        renderTextField('baseUrl', 'Base URL', draft.baseUrl, 'https://your-vision-endpoint/v1', onChange),
        renderTextField('model', '模型', draft.model, 'your-vision-model', onChange),
        renderApiKeyEnvField(draft.apiKeyEnv, apiKeyError, onChange),
        React.createElement('div', { className: 'periscope-actions' },
          React.createElement('button', { 'data-action': 'save', onClick: onSave, disabled: busy }, '保存'),
          React.createElement('button', { 'data-action': 'discard', onClick: onDiscard, disabled: busy }, '还原'),
          React.createElement('button', { 'data-action': 'ping', onClick: onPing, disabled: pinging || busy }, pinging ? '探测中…' : '测试连接'),
        ),
        ping ? React.createElement('div', { className: 'periscope-msg', 'data-ping-result': ping.ok ? 'reachable' : 'unreachable' },
          ping.text,
          ping.hint ? React.createElement('div', { className: 'periscope-hint', 'data-ping-hint': true }, ping.hint) : null,
        ) : null,
        msg ? React.createElement('div', { className: 'periscope-msg', 'data-status': msg.status }, msg.text) : null,
      )
    }

    // ── 插件入口：注册进 Plugins 设置区每插件一张卡的槽位 ─────────────────────────────

    function apply(ctx) {
      ctx.slots.inject('settings.plugin.item', function () {
        return ctx.slots.register(
          {
            name: 'settings.plugin.item',
            id: 'periscope-vision',
            order: 100,
            label: 'periscope 视觉端点',
            inject: function () {
              return { connection: ctx.connection }
            },
          },
          VisionEndpointCard,
        )
      })
    }

    module.exports = {
      name: 'periscope-dsh',
      inject: ['slots', 'connection'],
      apply: apply,
    }
    return module.exports
  },
})
