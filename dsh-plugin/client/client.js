/**
 * periscope-dsh browser half —— 视觉端点配置卡片（issue #34）。
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
 * update 合并写 user 层。卡片不直接触碰 settings 服务，也不走 settings 网关
 * （api-proxy 的 exposedNamespaces() 白名单拒第三方命名空间，spike #32 实测阻断）。
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
        '.periscope-error{font-size:12px;color:var(--dsw-alias-label-error)}'
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

    /** describe 结果 → 表单初值：取 settings 命名空间的当前解析值（user 层已叠 base/默认）。 */
    function formFromRead(read) {
      if (!read || read.ok !== true || !read.value || read.value.registered === false || !read.value.value) {
        return emptyForm()
      }
      var v = read.value.value
      return {
        protocol: v.protocol || 'openai',
        baseUrl: typeof v.baseUrl === 'string' ? v.baseUrl : '',
        model: typeof v.model === 'string' ? v.model : '',
        apiKeyEnv: typeof v.apiKeyEnv === 'string' ? v.apiKeyEnv : '',
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

    function renderTextField(field, label, value, placeholder, onChange) {
      return React.createElement('label', { className: 'periscope-field' },
        React.createElement('span', { className: 'periscope-label' }, label),
        React.createElement('input', {
          'data-field': field,
          type: 'text',
          value: value,
          placeholder: placeholder,
          onChange: function (e) { onChange(field, e.target.value) },
        }),
      )
    }

    function renderApiKeyEnvField(value, error, onChange) {
      return React.createElement('label', { className: 'periscope-field' },
        React.createElement('span', { className: 'periscope-label' }, 'apiKey 环境变量名'),
        React.createElement('input', {
          'data-field': 'apiKeyEnv',
          type: 'text',
          value: value,
          placeholder: 'PERISCOPE_API_KEY',
          onChange: function (e) { onChange('apiKeyEnv', e.target.value) },
        }),
        React.createElement('span', { className: 'periscope-hint' },
          '只填环境变量名（如 PERISCOPE_API_KEY），不填字面 key；本地无鉴权端点可留空'),
        error
          ? React.createElement('span', { className: 'periscope-error', 'data-error': 'apiKeyEnv' }, error)
          : null,
      )
    }

    function errorTextOf(res) {
      if (res && res.error) {
        if (typeof res.error.message === 'string' && res.error.message !== '') return res.error.message
        var json = JSON.stringify(res.error)
        if (json && json !== '{}') return json
      }
      return '未知错误'
    }

    /** 消息的 data-status：saved / busy / error 三态（对齐 msg 语义，供样式与测试锚点）。 */
    function msgStatus(msg) {
      if (msg === '已保存') return 'saved'
      if (msg === '保存中…') return 'busy'
      return 'error'
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
      var msgState = React.useState('')
      var msg = msgState[0]
      var setMsg = msgState[1]
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]

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
            setMsg('读取配置失败：' + (e && e.message ? e.message : String(e)))
          })
        return function () { cancelled = true }
      }, [])

      if (draft === null) {
        return React.createElement('div', { className: 'periscope-card', 'data-periscope-card': true },
          React.createElement('div', { 'data-status': 'loading' }, '加载中…'))
      }

      var apiKeyError = validateApiKeyEnv(draft.apiKeyEnv)

      function onChange(field, value) {
        setDraft(withField(draft, field, value))
        setMsg('')
      }

      function onSave() {
        if (busy) return
        // 非法 apiKeyEnv 由字段内联错误提示展示，这里不再写全局 msg（避免同一错误两处重复）。
        if (validateApiKeyEnv(draft.apiKeyEnv)) return
        setBusy(true)
        setMsg('保存中…')
        Promise.resolve(conn.rpc.call('/periscope', 'update', { patch: patchFromForm(draft) }))
          .then(function (res) {
            setBusy(false)
            if (res && res.ok) {
              setLoaded(draft)
              setMsg('已保存')
            } else {
              setMsg('保存失败：' + errorTextOf(res))
            }
          })
          .catch(function (e) {
            setBusy(false)
            setMsg('保存失败：' + (e && e.message ? e.message : String(e)))
          })
      }

      function onDiscard() {
        if (busy) return
        setDraft(loaded || emptyForm())
        setMsg('')
      }

      return React.createElement('div', { className: 'periscope-card', 'data-periscope-card': true },
        React.createElement('div', { className: 'periscope-card-title' }, 'periscope 视觉端点'),
        renderProtocolSelect(draft.protocol, onChange),
        renderTextField('baseUrl', 'Base URL', draft.baseUrl, 'https://your-vision-endpoint/v1', onChange),
        renderTextField('model', '模型', draft.model, 'your-vision-model', onChange),
        renderApiKeyEnvField(draft.apiKeyEnv, apiKeyError, onChange),
        React.createElement('div', { className: 'periscope-actions' },
          React.createElement('button', { 'data-action': 'save', onClick: onSave, disabled: busy }, '保存'),
          React.createElement('button', { 'data-action': 'discard', onClick: onDiscard, disabled: busy }, '还原'),
        ),
        msg ? React.createElement('div', { className: 'periscope-msg', 'data-status': msgStatus(msg) }, msg) : null,
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
