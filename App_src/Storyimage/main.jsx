import React, { useCallback, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import StoryboardStudio from './ai_storyboard_studio.tsx';

const params = new URLSearchParams(window.location.search);
const addonMode = ['audio2video', 'fmaviewer'].includes(params.get('addon'));
const fmaViewerMode = params.get('addon') === 'fmaviewer';
const hostOrigin = params.get('origin') || window.location.origin;
const initialTheme = localStorage.getItem('audio2video-storyboard-theme') || 'dark';
document.documentElement.classList.toggle('dark', initialTheme === 'dark');

function StoryboardAddon() {
  useEffect(() => {
    if (!addonMode) return;
    const target = window.opener || (window.parent !== window ? window.parent : null);
    if (!target) return;
    target.postMessage({
      type: fmaViewerMode ? 'fma-app-ready' : 'storyboard-studio-ready',
      app: fmaViewerMode ? 'story' : undefined,
    }, fmaViewerMode ? '*' : hostOrigin);
  }, []);

  const sendImages = useCallback((images, requestId) => {
    if (!addonMode) return;
    const target = window.opener || (window.parent !== window ? window.parent : null);
    if (!target) return;
    target.postMessage({
      type: fmaViewerMode ? 'fma-app-images' : 'storyboard-studio-commit',
      app: fmaViewerMode ? 'story' : undefined,
      requestId,
      images,
    }, fmaViewerMode ? '*' : hostOrigin);
  }, []);

  return <StoryboardStudio addonMode={addonMode} onSendImages={sendImages} />;
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoryboardAddon />
  </React.StrictMode>,
);
