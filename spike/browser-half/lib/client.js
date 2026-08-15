/**
 * spike #32 即弃最小包 —— browser half（dsh.client 装载面，client-modules 机制 B）。
 *
 * 这是手写的 CJS factory bundle，与 tsdown `clientBundle()` 产物同构：
 *   banner  window.__ModuleLoader__.load({ id, factory: (require) => {
 *   intro   var module = { exports: {} }; var exports = module.exports;
 *   footer  return module.exports; } });
 * 浏览器 ClientModuleSystem 以 classic script 装载本文件 → 执行仅注册 factory →
 * cordis Loader 经 internal.import 物化 factory → 取 module.exports 作为插件。
 *
 * factory 的 require 只能解析平台 seed 模块（react / cordis / ui-slots / …）与
 * 声明的 inject 边；React 经 require('react') 取得，故只能 React.createElement，
 * 无 JSX / TS / import —— 与 issue 的约束一致。
 *
 * spike 实证探针：机制 B 下本 bundle 是 CJS factory，并不被 cordis-client-runner 的
 * 闭包沙盒（evaluateClientHalf）包装，因此没有 host / harness / styles 这些闭包符号。
 * 卡片把 typeof host / harness / styles 渲染出来，直接证明 issue 设想的
 * host.call→harness.handle RPC 在这条装载面上不可用；settings 读写改经
 * ctx.settingsScope.bind()（= 机制 B 的 settings 网关面，与 shipped 卡片同源）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-spike-browser-half',
  factory: function (require) {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')

    var NS = 'spike-visual'

    // 机制 B 的 CSS 注入：没有 styles.insert 闭包符号，直接在 factory 里插 <style>。
    // （模块系统 unload 时会按 data-plugin 回收本标签。）
    if (typeof document !== 'undefined') {
      var tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-spike-browser-half'
      tag.textContent =
        '.spike32-card{display:flex;flex-direction:column;gap:8px;padding:16px 0;' +
        'border-bottom:1px solid var(--dsw-alias-border-l2);font-size:14px;' +
        'color:var(--dsw-alias-label-primary)}' +
        '.spike32-card input{font:inherit;padding:4px 8px;background:var(--dsw-alias-bg-layer-1);' +
        'color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l2);border-radius:6px}' +
        '.spike32-card button{font:inherit;align-self:flex-start;padding:4px 12px;cursor:pointer;' +
        'border-radius:6px;border:1px solid var(--dsw-alias-border-l2);' +
        'background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary)}' +
        '.spike32-meta{font-size:12px;color:var(--dsw-alias-label-secondary);white-space:pre-wrap}'
      document.head.appendChild(tag)
    }

    function Card() {
      var scope = Card.scope
      var inputState = React.useState('')
      var input = inputState[0]
      var setInput = inputState[1]
      var snapState = React.useState(function () { return scope.getSnapshot() })
      var snap = snapState[0]
      var setSnap = snapState[1]
      var msgState = React.useState('')
      var msg = msgState[0]
      var setMsg = msgState[1]

      React.useEffect(function () {
        var unsub = scope.subscribe(function () { setSnap(scope.getSnapshot()) })
        scope.load()
        return unsub
      }, [])

      var persisted = snap && snap.user && snap.user.endpoint !== undefined
        ? snap.user.endpoint
        : (snap && snap.value && snap.value.endpoint !== undefined ? snap.value.endpoint : '')

      function onSave() {
        setMsg('保存中…')
        // 原始探针：直接调 settings 网关 mutate，把真实响应/错误码渲染出来
        //（settingsScope.set 会内部吞错重读，看不到 settings-not-exposed）。
        var conn = Card.connection
        if (!conn || !conn.api || !conn.api.settings) { setMsg('no connection.api.settings'); return }
        Promise.resolve(conn.api.settings.mutate({ ns: NS, ops: [{ op: 'set', path: ['endpoint'], value: input }] }))
          .then(function (res) {
            var r = res && res.result
            if (r && r.ok) setMsg('mutate ok user=' + JSON.stringify(r.value && r.value.user))
            else setMsg('mutate err: ' + JSON.stringify((r && r.error) || res))
          })
          .catch(function (e) { setMsg('mutate threw: ' + (e && e.message ? e.message : String(e))) })
      }

      return React.createElement('div', { className: 'spike32-card', 'data-spike': '32' },
        React.createElement('div', null, 'spike#32 视觉端点（即弃最小验证卡）'),
        React.createElement('input', {
          'data-spike': 'input',
          value: input,
          placeholder: 'https://your-vision-endpoint/v1',
          onChange: function (e) { setInput(e.target.value) },
        }),
        React.createElement('button', { 'data-spike': 'save', onClick: onSave }, '保存'),
        React.createElement('div', { className: 'spike32-meta', 'data-spike': 'readback' },
          'status=' + (snap ? snap.status : '?') +
          ' | persisted=' + JSON.stringify(persisted) +
          ' | writable=' + String(snap && snap.writable) +
          (msg ? ' | ' + msg : '')),
        React.createElement('div', { className: 'spike32-meta', 'data-spike': 'probe' },
          'typeof host=' + (typeof host) +
          ' harness=' + (typeof harness) +
          ' styles=' + (typeof styles) +
          ' require=' + (typeof require)),
      )
    }

    module.exports = {
      name: 'dsh-spike-browser-half',
      inject: ['slots', 'settingsScope', 'connection'],
      apply: function (ctx) {
        var scope = ctx.settingsScope.bind({ namespace: NS })
        Card.scope = scope
        Card.connection = ctx.connection
        ctx.slots.inject('settings.plugin.item', function () {
          return ctx.slots.register(
            { name: 'settings.plugin.item', id: 'spike-visual', order: 100, label: 'Spike Visual' },
            Card,
          )
        })
      },
    }
    return module.exports
  },
})
