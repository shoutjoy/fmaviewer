(async function loadStandaloneStoryboard() {
  const root = document.getElementById('root');
  try {
    if (!window.React || !window.ReactDOM || !window.lucideReact || !window.Babel) {
      throw new Error('Story 앱 실행 라이브러리를 불러오지 못했습니다.');
    }
    const response = await fetch('./ai_storyboard_studio.tsx', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Story 소스 읽기 실패 (${response.status})`);
    let source = await response.text();

    const reactMatch = source.match(
      /import\s+React,\s*\{([\s\S]*?)\}\s+from\s+['"]react['"];\s*/
    );
    const lucideMatch = source.match(
      /import\s*\{([\s\S]*?)\}\s*from\s*['"]lucide-react['"];\s*/
    );
    if (!reactMatch || !lucideMatch) throw new Error('Story 모듈 가져오기 구문을 해석하지 못했습니다.');

    const reactNames = reactMatch[1].split(',').map(value => value.trim()).filter(Boolean);
    const lucideEntries = lucideMatch[1].split(',').map(value => value.trim()).filter(Boolean);
    const lucideDestructure = lucideEntries.map(entry => {
      const parts = entry.split(/\s+as\s+/);
      return parts.length === 2 ? `${parts[0].trim()}: ${parts[1].trim()}` : entry;
    }).join(', ');

    source = source
      .replace(reactMatch[0], '')
      .replace(lucideMatch[0], '')
      .replace(/export\s+default\s+function\s+App/, 'function App');

    const prelude =
      `const { ${reactNames.join(', ')} } = React;\n` +
      `const { ${lucideDestructure} } = lucideReact;\n`;
    const compiled = Babel.transform(prelude + source, {
      filename: 'ai_storyboard_studio.tsx',
      presets: [
        ['typescript', { allExtensions: true, isTSX: true }],
        ['react', { runtime: 'classic' }]
      ],
      sourceType: 'script'
    }).code;
    const App = new Function(
      'React',
      'ReactDOM',
      'lucideReact',
      `${compiled}\nreturn App;`
    )(window.React, window.ReactDOM, window.lucideReact);

    const params = new URLSearchParams(window.location.search);
    const addonMode = ['audio2video', 'fmaviewer'].includes(params.get('addon'));
    const fmaViewerMode = params.get('addon') === 'fmaviewer';
    const hostOrigin = params.get('origin') || window.location.origin;
    const target = window.opener || (window.parent !== window ? window.parent : null);
    const onSendImages = (images, requestId) => {
      if (!target) return;
      target.postMessage({
        type: fmaViewerMode ? 'fma-app-images' : 'storyboard-studio-commit',
        app: fmaViewerMode ? 'story' : undefined,
        requestId,
        images
      }, fmaViewerMode ? '*' : hostOrigin);
    };

    root.innerHTML = '';
    window.ReactDOM.createRoot(root).render(
      window.React.createElement(App, { addonMode, onSendImages })
    );
    if (target && addonMode) {
      target.postMessage({
        type: fmaViewerMode ? 'fma-app-ready' : 'storyboard-studio-ready',
        app: fmaViewerMode ? 'story' : undefined
      }, fmaViewerMode ? '*' : hostOrigin);
    }
  } catch (error) {
    console.error('Standalone Story app load failed:', error);
    root.innerHTML =
      `<div id="storyLoaderStatus">Story 앱을 시작하지 못했습니다.<br>${String(error.message || error)}</div>`;
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'fma-app-error',
        app: 'story',
        message: `Story 앱 로드 실패: ${String(error.message || error)}`
      }, '*');
    }
  }
})();
