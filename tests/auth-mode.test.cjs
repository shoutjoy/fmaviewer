const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const deploymentModeSource = fs.readFileSync(path.join(root, 'AuthData', 'deployment-mode.js'), 'utf8');
const modeSource = fs.readFileSync(path.join(root, 'AuthData', 'auth-mode.js'), 'utf8');
const bootstrapSource = fs.readFileSync(path.join(root, 'AuthData', 'auth-bootstrap.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const vercelIgnore = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');

function loadMode({ protocol, hostname, savedMode, deploymentMode = 'on' }) {
    const window = {
        location: { protocol, hostname },
        localStorage: { getItem: () => savedMode }
    };
    window.FMA_AUTH_DEFAULT_MODE = deploymentMode;
    vm.runInNewContext(modeSource, { window });
    return window.FMAAuthMode;
}

const defaultMode = loadMode({ protocol: 'https:', hostname: 'fmaviewer.example', savedMode: '' });
assert.equal(defaultMode.mode, 'on');
assert.equal(defaultMode.enabled, true, '공개 배포의 기본 인증은 ON이어야 합니다.');

const publicOverride = loadMode({ protocol: 'https:', hostname: 'fmaviewer.example', savedMode: 'off' });
assert.equal(publicOverride.enabled, true, '공개 호스트는 브라우저 저장소로 인증을 끌 수 없어야 합니다.');

const offDeployment = loadMode({ protocol: 'https:', hostname: 'addon.example', savedMode: '', deploymentMode: 'off' });
assert.equal(offDeployment.enabled, false, '인증 없는 별도 배포본은 OFF 기본값을 적용해야 합니다.');

const localOverride = loadMode({ protocol: 'http:', hostname: 'localhost', savedMode: 'off' });
assert.equal(localOverride.mode, 'off');
assert.equal(localOverride.enabled, false, 'localhost에서는 개발자 스위치가 적용되어야 합니다.');

function runBootstrap(enabled) {
    const writes = [];
    const document = {
        documentElement: { dataset: {} },
        write: value => writes.push(value)
    };
    const window = { FMAAuthMode: { enabled } };
    vm.runInNewContext(bootstrapSource, { window, document, Promise, Object });
    return { window, document, writes };
}

const offBootstrap = runBootstrap(false);
assert.equal(offBootstrap.document.documentElement.dataset.authMode, 'off');
assert.equal(offBootstrap.writes.length, 0, 'OFF 모드에서는 인증 스크립트를 로드하면 안 됩니다.');
assert.ok(offBootstrap.window.FMAAuthSettingsReady instanceof Promise);

const onBootstrap = runBootstrap(true);
assert.equal(onBootstrap.document.documentElement.dataset.authMode, 'on');
assert.equal(onBootstrap.writes.length, 5);
assert.match(onBootstrap.writes[0], /Auth\/gas\/version\.generated\.js/);
assert.match(onBootstrap.writes[4], /Auth\/client\.js/);

assert.match(indexSource, /AuthData\/auth-mode\.js/);
assert.match(indexSource, /AuthData\/auth-bootstrap\.js/);
assert.match(indexSource, /AuthData\/deployment-mode\.js[\s\S]*AuthData\/auth-mode\.js/);
assert.match(deploymentModeSource, /FMA_AUTH_DEFAULT_MODE\s*=\s*"on"/);
assert.doesNotMatch(indexSource, /<script src="Auth\/client\.js/);
assert.match(vercelIgnore, /^AuthData\/AuthSwitch\.html$/m);

console.log('auth-mode.test.cjs: 개발자 인증 ON/OFF 및 비공개 배포 계약 검증 통과');
