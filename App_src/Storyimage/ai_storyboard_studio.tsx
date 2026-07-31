import React, { useState, useRef, useCallback, useEffect } from 'react';
import { 
  Upload, Image as ImageIcon, Wand2, Plus, Loader2, Sparkles, 
  AlertCircle, Download, History, Layers, Images, Archive, 
  Maximize, UserCheck, Trash2, ImagePlus, Save, CheckCircle2,
  RefreshCw, MousePointerClick, ExternalLink, XCircle, FileText, Play,
  Shirt, ScanFace, Camera, Palette, Focus, BookOpen, ListOrdered, Film,
  Sliders, LayoutList, Grip, Database, FolderUp, Settings, ChevronLeft, 
  ChevronRight, X, MonitorPlay, ChevronDown, ChevronUp, Send, KeyRound,
  Eye, EyeOff, Link as LinkIcon, Sun, Moon
} from 'lucide-react';

const GEMINI_API_KEY_STORAGE = 'audio2video-gemini-api-key';
const FMA_SHARED_API_KEY_STORAGE = 'fma_ai_studio_api_key';
const AI_STUDIO_API_KEY_URL = 'https://aistudio.google.com/app/apikey';
const GEMINI_REFERENCE_APP_URL = 'https://gemini.google.com/share/2d8f472bde4d?skid=65ffd8be-4a42-472b-9396-5e4015f5d4f7';
const STORY_TEXT_MODEL = 'gemini-2.5-flash';
const STORY_IMAGE_MODEL = 'gemini-3.1-flash-image';
const STORYBOARD_THEME_STORAGE = 'audio2video-storyboard-theme';

const getStoredStoryApiKey = () => {
  const dedicated = localStorage.getItem(GEMINI_API_KEY_STORAGE)?.trim() || '';
  const shared = localStorage.getItem(FMA_SHARED_API_KEY_STORAGE)?.trim() || '';
  return {
    key: dedicated || shared,
    source: dedicated ? 'app' : (shared ? 'shared' : 'empty')
  };
};

// External libraries loaded via CDN
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// IndexedDB 설정
const DB_NAME = "StoryboardStudioDB";
const STORE_NAME = "projects";

const openDB = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME, { keyPath: "id" });
  request.onsuccess = (e) => resolve(e.target.result);
  request.onerror = (e) => reject(e.target.error);
});

// Safety Settings
const safetySettings = [
  { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
  { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
];

// Fetch function with retry
const fetchWithRetry = async (url, options, maxRetries = 5) => {
  let retries = 0;
  const delays = [1000, 2000, 4000, 8000, 16000];
  while (retries < maxRetries) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      retries++;
      if (retries >= maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[retries - 1]));
    }
  }
};

const extractBase64Data = (dataUrl) => dataUrl ? (dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl) : null;
const extractMimeType = (dataUrl) => dataUrl && dataUrl.includes(':') ? dataUrl.substring(dataUrl.indexOf(':') + 1, dataUrl.indexOf(';')) : 'image/jpeg';

const compressImage = (file, maxWidth = 1024, maxHeight = 1024) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.8)); 
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

export default function App({ addonMode = false, onSendImages = null }) {
  const [theme, setTheme] = useState(() => localStorage.getItem(STORYBOARD_THEME_STORAGE) || 'dark');
  const [apiKey, setApiKey] = useState(() => getStoredStoryApiKey().key);
  const [apiKeySource, setApiKeySource] = useState(() => getStoredStoryApiKey().source);
  const [showSettings, setShowSettings] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyStatus, setApiKeyStatus] = useState(() => (
    getStoredStoryApiKey().key ? 'saved' : 'empty'
  ));
  const [isTestingApiKey, setIsTestingApiKey] = useState(false);
  // === 1. Image Source States ===
  const [characterImages, setCharacterImages] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedStyle, setUploadedStyle] = useState(null); 
  const [styleMimeType, setStyleMimeType] = useState(null);
  
  // === 2. Story Generation States ===
  const [storyOutline, setStoryOutline] = useState('');
  const [characterDescription, setCharacterDescription] = useState('');
  const [sceneCount, setSceneCount] = useState(4);
  const [storyScenes, setStoryScenes] = useState([]);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);

  // === 3. Processing States ===
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const abortControllerRef = useRef(null);
  
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const progressInterval = useRef(null);

  // === 4. Options ===
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [imageStyle, setImageStyle] = useState('semi-realistic');
  
  // === 5. History & Project Board ===
  const [history, setHistory] = useState([]);
  const [projectBoard, setProjectBoard] = useState([]); 
  const [selectedResultId, setSelectedResultId] = useState(null);
  const [selectedSendIds, setSelectedSendIds] = useState([]);
  const [error, setError] = useState(null);

  // === 6. Image Tuning States ===
  const [tuning, setTuning] = useState({ brightness: 100, contrast: 100, saturate: 100, sepia: 0, hueRotate: 0 });

  // === 7. UI States (V13+) ===
  const [autoSaveInterval, setAutoSaveInterval] = useState(5);
  const [showPresentation, setShowPresentation] = useState(false);
  const [presIndex, setPresIndex] = useState(0);
  const [presZoom, setPresZoom] = useState(80);

  // 컨테이너 접기/펼치기 상태 관리
  const [collapsed, setCollapsed] = useState({
    character: false,
    story: false,
    scene: false,
    board: false,
    viewer: false,
    pool: false
  });
  const toggleCollapse = (key) => setCollapsed(prev => ({...prev, [key]: !prev[key]}));

  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((msg) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, msg }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const fileInputRef = useRef(null);
  const styleFileInputRef = useRef(null);
  const [librariesLoaded, setLibrariesLoaded] = useState(false);

  // 초기 라이브러리 로드
  useEffect(() => {
    Promise.all([
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'),
      loadScript('https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js')
    ]).then(() => setLibrariesLoaded(true)).catch(() => setError('필수 라이브러리 로드 실패'));
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(STORYBOARD_THEME_STORAGE, theme);
  }, [theme]);

  const testApiKey = async () => {
    const key = apiKey.trim();
    if (!key) {
      setApiKeyStatus('empty');
      setError('테스트할 Google AI Studio API 키를 입력해 주십시오.');
      return;
    }
    setIsTestingApiKey(true);
    setApiKeyStatus('testing');
    setError(null);
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error?.message || `HTTP ${response.status}`);
      }
      setApiKeyStatus('valid');
      addToast('API 키 연결을 확인했습니다. 스토리와 이미지를 생성할 수 있습니다.');
    } catch (err) {
      setApiKeyStatus('invalid');
      setError(`API 키 연결 실패: ${err.message}`);
    } finally {
      setIsTestingApiKey(false);
    }
  };

  const saveApiKey = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      localStorage.removeItem(GEMINI_API_KEY_STORAGE);
      setApiKeyStatus('empty');
      setError('저장할 API 키를 입력해 주십시오.');
      return;
    }
    localStorage.setItem(GEMINI_API_KEY_STORAGE, trimmed);
    setApiKey(trimmed);
    setApiKeySource('app');
    setApiKeyStatus('saved');
    setError(null);
    addToast('API 키를 이 브라우저에 저장했습니다.');
  };

  const clearApiKey = () => {
    localStorage.removeItem(GEMINI_API_KEY_STORAGE);
    const shared = localStorage.getItem(FMA_SHARED_API_KEY_STORAGE)?.trim() || '';
    setApiKey(shared);
    setApiKeySource(shared ? 'shared' : 'empty');
    setApiKeyStatus(shared ? 'saved' : 'empty');
    setError(null);
    addToast(shared ? 'Story 전용 키를 삭제하고 FMA 공통 키로 전환했습니다.' : '저장된 Story 전용 키를 삭제했습니다.');
  };

  // 상태 번들링 (저장/불러오기 용이성 확보)
  const getProjectData = useCallback(() => ({
    storyOutline, characterDescription, sceneCount, storyScenes, history, projectBoard, tuning, aspectRatio, imageStyle
  }), [storyOutline, characterDescription, sceneCount, storyScenes, history, projectBoard, tuning, aspectRatio, imageStyle]);

  const loadProjectData = (data) => {
    if(data.storyOutline !== undefined) setStoryOutline(data.storyOutline);
    if(data.characterDescription !== undefined) setCharacterDescription(data.characterDescription);
    if(data.sceneCount !== undefined) setSceneCount(data.sceneCount);
    if(data.storyScenes) setStoryScenes(data.storyScenes);
    if(data.history) setHistory(data.history);
    if(data.projectBoard) setProjectBoard(data.projectBoard);
    if(data.tuning) setTuning(data.tuning);
    if(data.aspectRatio) setAspectRatio(data.aspectRatio);
    if(data.imageStyle) setImageStyle(data.imageStyle);
  };

  // 자동 저장
  useEffect(() => {
    if (autoSaveInterval <= 0) return;
    const interval = setInterval(async () => {
      try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put({ id: "active", ...getProjectData(), timestamp: Date.now() });
      } catch(e) { console.warn("Auto-save failed", e); }
    }, autoSaveInterval * 60000);
    return () => clearInterval(interval);
  }, [autoSaveInterval, getProjectData]);

  // 수동 저장 및 불러오기 (IndexedDB)
  const saveToIndexedDB = async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({ id: "active", ...getProjectData(), timestamp: Date.now() });
      addToast("프로젝트가 브라우저에 안전하게 저장되었습니다.");
    } catch(e) { setError("DB 저장 실패: " + e.message); }
  };

  const loadFromIndexedDB = async () => {
    try {
      const db = await openDB();
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get("active");
      request.onsuccess = () => {
        if(request.result) {
          loadProjectData(request.result);
          addToast("저장된 프로젝트를 불러왔습니다.");
        } else {
          setError("저장된 프로젝트가 없습니다.");
        }
      };
    } catch(e) { setError("DB 불러오기 실패: " + e.message); }
  };

  // SSG (JSON) 내보내기/가져오기
  const exportSSG = () => {
    const blob = new Blob([JSON.stringify(getProjectData())], { type: "application/json" });
    window.saveAs(blob, `project_${Date.now()}.ssg`);
  };

  const importSSG = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try { loadProjectData(JSON.parse(evt.target.result)); }
      catch(err) { setError("유효하지 않은 프로젝트 파일입니다."); }
    };
    reader.readAsText(file);
  };

  // 스토리 문서 내보내기/가져오기 (MD, TXT, HTML)
  const downloadStory = (format) => {
    if (storyScenes.length === 0) return setError("다운로드할 스토리 장면이 없습니다.");
    let content = "";
    if (format === 'md') {
      content = storyScenes.map(s => `## 컷 ${s.id}\n- 배경: ${s.background}\n- 포즈: ${s.pose}\n- 의상: ${s.clothing}\n- 요소: ${s.elements}\n- 추가요구: ${s.additionalPrompt || ''}`).join('\n\n');
    } else if (format === 'html') {
      content = `<html><head><meta charset="UTF-8"><title>Storyboard</title></head><body style="font-family:sans-serif; padding:20px;">${storyScenes.map(s => `<div style="margin-bottom:20px; padding:15px; border:1px solid #ccc; border-radius:8px;"><h3 style="margin-top:0; color:#4f46e5;">컷 ${s.id}</h3><ul style="line-height:1.6;"><li><b>배경:</b> ${s.background}</li><li><b>포즈:</b> ${s.pose}</li><li><b>의상:</b> ${s.clothing}</li><li><b>요소:</b> ${s.elements}</li><li><b>추가요구:</b> ${s.additionalPrompt || ''}</li></ul></div>`).join('')}</body></html>`;
    } else {
      content = storyScenes.map(s => `[컷 ${s.id}]\n배경: ${s.background}\n포즈: ${s.pose}\n의상: ${s.clothing}\n요소: ${s.elements}\n추가요구: ${s.additionalPrompt || ''}`).join('\n\n');
    }
    const mime = format === 'html' ? 'text/html' : 'text/plain';
    const blob = new Blob([content], { type: mime });
    window.saveAs(blob, `storyboard_document.${format}`);
  };

  const importStoryFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const newText = `\n\n--- 불러온 원고 문서 ---\n${evt.target.result}`;
      setStoryOutline(prev => prev + newText);
    };
    reader.readAsText(file);
  };

  // 시퀀스 풀 전체 ZIP 내보내기
  const downloadSequencePoolZip = async () => {
    if (!librariesLoaded || history.length === 0) return setError("생성된 이미지가 없습니다.");
    startProgress("시퀀스 풀 압축 중...");
    const zip = new window.JSZip();
    const folder = zip.folder("Sequence_Pool");
    history.forEach((h, i) => {
      const base64Data = extractBase64Data(h.image);
      folder.file(`sequence_${String(i+1).padStart(3, '0')}.png`, base64Data, { base64: true });
    });
    zip.generateAsync({ type: "blob" }).then(content => {
      window.saveAs(content, "sequence_pool_archive.zip");
      completeProgress();
    });
  };

  // 프로젝트 보드 외부 ZIP 불러오기
  const importProjectBoardZip = async (e) => {
    if (!librariesLoaded) return;
    const file = e.target.files[0];
    if (!file) return;
    startProgress("ZIP 이미지 로드 중...");
    try {
      const zip = await window.JSZip.loadAsync(file);
      const newHistory = [...history];
      const newBoard = [...projectBoard];
      let fileCount = 0;
      
      for (const relativePath in zip.files) {
        if (!zip.files[relativePath].dir && relativePath.match(/\.(png|jpe?g)$/i)) {
          const base64 = await zip.files[relativePath].async("base64");
          const dataUrl = `data:image/png;base64,${base64}`;
          const newItem = {
            id: Date.now() + fileCount + Math.random(),
            sceneIndex: fileCount,
            image: dataUrl,
            promptInfo: `ZIP Import: ${relativePath}`,
            timestamp: new Date().toLocaleString()
          };
          newHistory.push(newItem);
          
          // 빈 슬롯이 있으면 할당, 없으면 보드 확장
          const emptyIndex = newBoard.findIndex(v => v === null);
          if (emptyIndex !== -1) newBoard[emptyIndex] = newItem.id;
          else newBoard.push(newItem.id);
          
          fileCount++;
        }
      }
      setHistory(newHistory);
      setProjectBoard(newBoard);
      completeProgress();
    } catch (err) {
      setError("ZIP 파일 해석 실패: " + err.message);
      stopProgressWithError();
    }
  };

  const applyPreset = (presetName) => {
    switch(presetName) {
      case 'original': setTuning({ brightness: 100, contrast: 100, saturate: 100, sepia: 0, hueRotate: 0 }); break;
      case 'pastel': setTuning({ brightness: 110, contrast: 90, saturate: 85, sepia: 0, hueRotate: 0 }); break;
      case 'cool': setTuning({ brightness: 105, contrast: 110, saturate: 110, sepia: 0, hueRotate: -15 }); break;
      case 'semi-real': setTuning({ brightness: 100, contrast: 95, saturate: 90, sepia: 0, hueRotate: 0 }); break;
      case 'warm': setTuning({ brightness: 105, contrast: 95, saturate: 110, sepia: 30, hueRotate: 0 }); break;
      case 'cinematic': setTuning({ brightness: 95, contrast: 120, saturate: 80, sepia: 20, hueRotate: 10 }); break;
    }
  };

  const startProgress = (message) => {
    setProgress(0); setProgressMessage(message);
    if (progressInterval.current) clearInterval(progressInterval.current);
    progressInterval.current = setInterval(() => {
      setProgress(prev => Math.min(prev + (Math.random() * 8 + 2), 95));
    }, 800);
  };

  const completeProgress = () => {
    setProgress(100); setProgressMessage('작업 완료!');
    if (progressInterval.current) clearInterval(progressInterval.current);
    setTimeout(() => { setProgress(0); setProgressMessage(''); }, 2000);
  };

  const stopProgressWithError = () => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setProgress(0); setProgressMessage('');
  };

  const cancelGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      stopProgressWithError();
      setError('작업이 중단되었습니다.');
      setIsGenerating(false); setIsBatchGenerating(false); setIsGeneratingStory(false);
    }
  };

  const createAbortSignal = () => {
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current.signal;
  };

  const processCharacterFiles = async (files) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) return setError('이미지 파일만 업로드 가능합니다.');
    
    startProgress('이미지 최적화 및 추가 중...');
    const newImages = [];
    for (const file of imageFiles) {
      try {
        const compressedDataUrl = await compressImage(file);
        newImages.push({ data: compressedDataUrl, mimeType: 'image/jpeg' });
      } catch (err) {
        setError('일부 이미지 최적화 중 오류가 발생했습니다.');
      }
    }
    if (newImages.length > 0) {
      setCharacterImages(prev => [...prev, ...newImages]);
    }
    completeProgress();
  };

  const handleCharacterFileChange = (e) => {
    const files = Array.from(e.target.files);
    processCharacterFiles(files);
    e.target.value = null; // 초기화하여 같은 파일 재업로드 허용
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    processCharacterFiles(files);
  };

  const removeCharacterImage = (index) => {
    setCharacterImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileUpload = async (e, setFile, setMimeType) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) return setError('이미지 파일만 업로드 가능합니다.');
      try {
        const compressedDataUrl = await compressImage(file);
        setFile(compressedDataUrl);
        setMimeType('image/jpeg'); 
        setError(null);
      } catch (err) {
        setError('이미지 최적화 중 오류가 발생했습니다.');
      }
    }
  };

  const generateStoryScenes = async () => {
    if (!storyOutline.trim()) return setError('스토리 줄거리를 입력해 주십시오.');
    if (!apiKey.trim()) {
      setShowSettings(true);
      return setError('Google AI Studio API 키를 먼저 설정해 주십시오.');
    }
    const count = Number(sceneCount);
    if (isNaN(count) || count < 1) return setError('유효한 컷 수를 입력해 주십시오.');

    setIsGeneratingStory(true); setError(null);
    startProgress('줄거리를 분석하여 스토리보드 장면으로 분할 중입니다...');
    const signal = createAbortSignal();

    try {
      const prompt = `당신은 전문 스토리보드 아티스트이자 프롬프트 엔지니어이다. 
다음 제공된 [스토리 줄거리]를 바탕으로, 시각적으로 매끄럽게 연결되는 총 ${count}컷의 스토리보드 프롬프트를 작성하라.
캐릭터의 시각적 일관성을 위해, 제공된 [메인 캐릭터 외형 묘사]를 모든 장면에 일관되게 반영해야 한다.

[메인 캐릭터 외형 묘사]: ${characterDescription || '사용자가 제공한 원본 이미지의 인물과 동일'}
[스토리 줄거리]: ${storyOutline}

출력은 반드시 다른 텍스트 없이 아래의 JSON 배열 형식으로만 반환하라.
{
  "scenes": [
    {
      "id": 1,
      "background": "장소, 시간대, 날씨, 조명 등에 대한 구체적인 배경 묘사",
      "pose": "이 장면에서의 메인 캐릭터의 행동, 자세, 표정, 시선 처리",
      "clothing": "이 장면에 맞는 메인 캐릭터의 의상 및 스타일",
      "elements": "화면에 포함되어야 할 중요한 소품, 주변 사물, 혹은 엑스트라 인물",
      "additionalPrompt": ""
    }
  ]
}`;

      const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${STORY_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: signal,
        body: JSON.stringify({ 
          contents: [{ role: "user", parts: [{ text: prompt }] }], 
          generationConfig: { responseMimeType: "application/json" },
          safetySettings: safetySettings 
        })
      });

      const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        // 정규식 대신 indexOf를 사용하여 JSON 문자열을 안전하게 추출합니다.
        let jsonString = text;
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          jsonString = text.substring(start, end + 1);
        }
        
        try {
          const parsed = JSON.parse(jsonString);
          setStoryScenes(parsed.scenes || []);
          setActiveSceneIndex(0);
          // 프로젝트 보드 초기화 및 보존 처리
          if (projectBoard.length < count) {
             const newBoard = [...projectBoard];
             newBoard.length = count;
             newBoard.fill(null, projectBoard.length);
             setProjectBoard(newBoard);
          }
        } catch (parseError) {
          console.error("원본 응답 텍스트:", text);
          console.error("파싱 시도된 텍스트:", jsonString);
          throw new Error('응답을 파싱하는 중 오류가 발생했습니다. AI가 올바른 데이터를 반환하지 못했습니다.');
        }
      } else {
        throw new Error('장면 분할 결과를 가져올 수 없습니다.');
      }
      completeProgress();
    } catch (err) { 
      if (err.name !== 'AbortError') { 
        console.error(err); 
        setError('스토리 분할 중 오류가 발생했습니다: ' + err.message); 
        stopProgressWithError(); 
      }
    } finally { 
      setIsGeneratingStory(false); 
    }
  };

  const updateScene = (index, field, value) => {
    const updatedScenes = [...storyScenes];
    updatedScenes[index] = { ...updatedScenes[index], [field]: value };
    setStoryScenes(updatedScenes);
  };

  const buildSceneCompositePrompt = (scene) => {
    let baseStyleInstruction = '';
    let styleRefInstruction = '';

    if (imageStyle === 'animation') {
      baseStyleInstruction = `[화풍 기본 지침]: 고품질 2D 웹툰/애니메이션 화풍(High-end webtoon, Masterpiece anime style)으로 렌더링할 것.`;
    } else if (imageStyle === 'semi-realistic') {
      baseStyleInstruction = `[화풍 기본 지침]: 실사와 2D 일러스트의 감성이 결합된 최고급 반실사(Semi-realistic, 2.5D, hyper-detailed anime) 화풍으로 렌더링할 것.`;
    } else {
      baseStyleInstruction = `[화풍 기본 지침]: 극사실주의적 실사 사진(Photorealistic, 8k resolution, cinematic lighting) 형태로 렌더링할 것.`;
    }

    if (uploadedStyle) {
      styleRefInstruction = `[스타일 참조]: [소스 2: 화풍/스타일 참조 이미지]의 작화, 선화, 조명, 색감을 완벽히 모방해라.`;
    }

    const additionalText = scene.additionalPrompt ? `[추가 요구사항]: ${scene.additionalPrompt}` : '';
    const charDescText = characterDescription ? `[캐릭터 외형 보강]: ${characterDescription}` : '';
    const sourceInstruction = characterImages.length > 0 
        ? `[얼굴/아이덴티티 일관성]: 제공된 ${characterImages.length}장의 [원본 인물 이미지]들을 종합적으로 참조하여, 이 인물을 메인 피사체로 삼아라. 얼굴과 생김새를 정확히 보존해라.` 
        : `[캐릭터 일관성]: 지정된 묘사에 맞춰 일관된 캐릭터를 생성해라.`;
    
    const noTextInstruction = `[텍스트 렌더링 절대 금지]: 이미지 내에 글씨, 문자, 단어가 깨져서 나타나지 않도록 텍스트를 생성하지 마라. 시각적 기호나 간판이 필수적인 상황이라면 무조건 '영어(English)' 알파벳으로만 최소한으로 표기하라.`;

    return `[장면 렌더링 절대 지침]
당신은 연속된 스토리의 컷을 생성하고 있다. 아래의 상황에 맞게 한 장의 완벽한 일러스트/사진을 생성하라.

${sourceInstruction}
${charDescText}
${noTextInstruction}

[현재 장면 상세 설정]
- 배경 및 환경: ${scene.background}
- 캐릭터 자세 및 행동: ${scene.pose}
- 캐릭터 의상: ${scene.clothing}
- 추가 요소/주변 인물: ${scene.elements}

[스타일 및 구도 설정]
${baseStyleInstruction}
${styleRefInstruction}
- 화면 비율: ${aspectRatio}
${additionalText}

반드시 지정된 배경 속에서, 지정된 의상을 입고, 지정된 자세를 취하고 있는 캐릭터를 렌더링하라.`;
  };

  const generateSingleScene = async (scene, sceneIndex, signal) => {
    if (!apiKey.trim()) throw new Error('Google AI Studio API 키를 먼저 입력해 주십시오.');
    const compositePrompt = buildSceneCompositePrompt(scene);
    
    const parts = [{ text: compositePrompt }];
    if (characterImages.length > 0) {
      parts.push({ text: `\n\n--- [소스 1: 원본 인물 이미지들 (총 ${characterImages.length}장) - 캐릭터 아이덴티티 참조] ---` });
      characterImages.forEach((img, idx) => {
        parts.push({ text: `\n[인물 참조 이미지 ${idx + 1}]` });
        parts.push({ inlineData: { mimeType: img.mimeType, data: extractBase64Data(img.data) } });
      });
    }
    if (uploadedStyle) {
      parts.push({ text: "\n\n--- [소스 2: 화풍/스타일 참조 이미지] ---" });
      parts.push({ inlineData: { mimeType: styleMimeType, data: extractBase64Data(uploadedStyle) } });
    }

    const result = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/${STORY_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey.trim())}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: signal,
      body: JSON.stringify({ 
        contents: [{ role: "user", parts: parts }], 
        generationConfig: { responseModalities: ['IMAGE'] },
        safetySettings: safetySettings
      })
    });

    if (result.promptFeedback && result.promptFeedback.blockReason) {
      throw new Error("안전 필터에 의해 생성이 차단되었습니다.");
    }
    
    const imagePart = result.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    if (!imagePart) throw new Error("API에서 이미지를 반환하지 않았습니다.");
    
    const imageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    return {
      sceneId: scene.id,
      sceneIndex: sceneIndex,
      image: imageUrl,
      promptInfo: `컷 ${scene.id}: ${scene.pose} / ${scene.background}`,
      timestamp: new Date().toLocaleString()
    };
  };

  const handleGenerateCurrentScene = async () => {
    const currentScene = storyScenes[activeSceneIndex];
    if (!currentScene) return;
    if (!apiKey.trim()) {
      setShowSettings(true);
      setError('Google AI Studio API 키를 먼저 설정해 주십시오.');
      return;
    }
    
    setIsGenerating(true); setError(null);
    startProgress(`컷 ${currentScene.id} 렌더링 중...`);
    const signal = createAbortSignal();
    
    try {
      const resultData = await generateSingleScene(currentScene, activeSceneIndex, signal);
      const newItem = { id: Date.now(), ...resultData };
      setHistory(prev => [newItem, ...prev]);
      setSelectedResultId(newItem.id);
      addToast(`컷 ${currentScene.id} 렌더링이 완료되었습니다!`);
      completeProgress();
    } catch (err) { 
      if (err.name !== 'AbortError') { 
        setError(err.message || '이미지 생성 중 오류 발생.'); 
        stopProgressWithError(); 
      }
    } finally { 
      setIsGenerating(false); 
    }
  };

  const generateBatchScenes = async () => {
    if (storyScenes.length === 0) return setError('스토리 장면이 분할되지 않았습니다.');
    if (!apiKey.trim()) {
      setShowSettings(true);
      setError('Google AI Studio API 키를 먼저 설정해 주십시오.');
      return;
    }
    setIsBatchGenerating(true); setError(null);
    startProgress('스토리보드 전체 컷 순차 렌더링 중...');
    const signal = createAbortSignal();
    
    try {
      for (let i = 0; i < storyScenes.length; i++) {
        setActiveSceneIndex(i);
        setProgressMessage(`전체 ${storyScenes.length}컷 중 ${i + 1}번째 컷 생성 중...`);
        
        const resultData = await generateSingleScene(storyScenes[i], i, signal);
        const newItem = { id: Date.now() + i, ...resultData };
        setHistory(prev => [newItem, ...prev]);
        
        if (i === 0) setSelectedResultId(newItem.id);
        addToast(`컷 ${storyScenes[i].id} 렌더링 완료!`);
      }
      addToast('전체 컷 순차 렌더링이 완료되었습니다.');
      completeProgress();
    } catch (err) {
      if (err.name !== 'AbortError') { 
        setError('일괄 생성 중 오류 발생: ' + err.message); 
        stopProgressWithError(); 
      }
    } finally { 
      setIsBatchGenerating(false); 
    }
  };

  const assignToProjectBoard = (slotIndex) => {
    if (!selectedResultId) return;
    const newBoard = [...projectBoard];
    newBoard[slotIndex] = selectedResultId;
    setProjectBoard(newBoard);
  };

  const unassignFromProjectBoard = (slotIndex) => {
    const newBoard = [...projectBoard];
    newBoard[slotIndex] = null;
    setProjectBoard(newBoard);
  };

  const drawTunedImageToBlob = (imageUrl) => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.filter = `brightness(${tuning.brightness}%) contrast(${tuning.contrast}%) saturate(${tuning.saturate}%) sepia(${tuning.sepia}%) hue-rotate(${tuning.hueRotate}deg)`;
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => resolve(blob), 'image/png');
      };
      img.src = imageUrl;
    });
  };

  const downloadSingleTunedImage = async () => {
    const activeResult = history.find(item => item.id === selectedResultId);
    if (!activeResult) return;
    const blob = await drawTunedImageToBlob(activeResult.image);
    window.saveAs(blob, `tuned_scene_${activeResult.sceneIndex + 1}_${Date.now()}.png`);
  };

  const downloadProjectZip = async () => {
    if (!librariesLoaded || projectBoard.every(id => id === null)) return setError('프로젝트 보드에 저장할 이미지가 없습니다.');
    const zip = new window.JSZip();
    const folder = zip.folder("완성된_스토리보드");
    
    startProgress('프로젝트 이미지 압축 중...');
    for (let i = 0; i < projectBoard.length; i++) {
      const historyId = projectBoard[i];
      if (historyId) {
        const item = history.find(h => h.id === historyId);
        if (item) {
          const blob = await drawTunedImageToBlob(item.image);
          folder.file(`scene_${String(i + 1).padStart(2, '0')}.png`, blob);
        }
      }
    }
    zip.generateAsync({ type: "blob" }).then(content => {
      window.saveAs(content, "final_project_board.zip");
      completeProgress();
    });
  };

  const downloadDirectImage = (item) => {
    if (!item || !item.image) return;
    fetch(item.image).then(res => res.blob()).then(blob => window.saveAs(blob, `generated_scene_${item.sceneIndex + 1}_${item.id}.png`));
  };

  const activeResult = history.find(item => item.id === selectedResultId) || history[0];

  const toggleSendSelection = (id) => {
    setSelectedSendIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const prepareStoryImagesForFma = async (items) => {
    return Promise.all(items.map(async (item, index) => {
      const blob = await drawTunedImageToBlob(item.image);
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      return {
        dataUrl,
        mimeType: 'image/png',
        name: `storyboard_scene_${String(item.sceneIndex + 1).padStart(2, '0')}_${index + 1}.png`,
      };
    }));
  };

  const sendSelectedImages = async (requestId = null) => {
    if (!onSendImages || selectedSendIds.length === 0) {
      setError('메인 앱으로 보낼 이미지를 한 장 이상 선택해 주십시오.');
      if (requestId && window.parent !== window) {
        window.parent.postMessage({
          type: 'fma-app-error',
          app: 'story',
          requestId,
          message: '스토리 히스토리에서 보낼 이미지를 먼저 체크하세요.',
        }, '*');
      }
      return;
    }
    startProgress('선택한 이미지를 메인 앱으로 준비 중...');
    try {
      const selectedItems = selectedSendIds
        .map((id) => history.find((item) => item.id === id))
        .filter(Boolean);
      const images = await prepareStoryImagesForFma(selectedItems);
      onSendImages(images, requestId);
      completeProgress();
    } catch (err) {
      setError(`이미지 보내기 실패: ${err.message}`);
      stopProgressWithError();
    }
  };

  const sendAllHistoryImages = async (requestId = null) => {
    if (!onSendImages || history.length === 0) {
      setError('메인 앱으로 보낼 히스토리 이미지가 없습니다.');
      if (requestId && window.parent !== window) {
        window.parent.postMessage({
          type: 'fma-app-error',
          app: 'story',
          requestId,
          message: '스토리 이미지 히스토리가 비어 있습니다.',
        }, '*');
      }
      return;
    }
    startProgress('전체 히스토리를 메인 앱으로 준비 중...');
    try {
      const orderedHistory = [...history].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      const images = await prepareStoryImagesForFma(orderedHistory);
      onSendImages(images, requestId);
      completeProgress();
    } catch (err) {
      setError(`전체 히스토리 보내기 실패: ${err.message}`);
      stopProgressWithError();
    }
  };

  useEffect(() => {
    if (!addonMode) return undefined;
    const handleFmaRequest = (event) => {
      const data = event.data || {};
      if (data.type === 'fma-app-shared-api-key-updated') {
        const dedicated = localStorage.getItem(GEMINI_API_KEY_STORAGE)?.trim() || '';
        if (!dedicated) {
          const shared = String(data.key || '').trim();
          setApiKey(shared);
          setApiKeySource(shared ? 'shared' : 'empty');
          setApiKeyStatus(shared ? 'saved' : 'empty');
        }
        return;
      }
      if (data.type !== 'fma-app-request-images' || data.app !== 'story') return;
      if (data.mode === 'all') sendAllHistoryImages(data.requestId);
      else sendSelectedImages(data.requestId);
    };
    window.addEventListener('message', handleFmaRequest);
    return () => window.removeEventListener('message', handleFmaRequest);
  }, [addonMode, history, selectedSendIds, tuning]);

  return (
    <div id="storyboard-studio-root" className="min-h-screen bg-[#0d1117] p-4 md:p-8 font-sans text-slate-200">
      
      {/* Top Global Navigation Bar */}
      <nav className="max-w-7xl mx-auto flex items-center flex-wrap gap-4 bg-[#161b22] p-4 rounded-xl mb-6 border border-slate-700 shadow-lg sticky top-4 z-40">
        <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
          <Database className="w-5 h-5 text-indigo-400" />
          <span className="font-bold text-sm text-white">프로젝트 I/O</span>
        </div>
        
        <button onClick={saveToIndexedDB} className="flex items-center gap-1.5 bg-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-500 transition-colors">
          <Save size={14}/> 저장 (DB)
        </button>
        <button onClick={loadFromIndexedDB} className="flex items-center gap-1.5 bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-600 transition-colors">
          <FolderUp size={14}/> 로드 (DB)
        </button>
        <button onClick={exportSSG} className="flex items-center gap-1.5 bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-600 transition-colors ml-2">
          <Download size={14}/> .ssg 내보내기
        </button>
        <label className="flex items-center gap-1.5 bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer hover:bg-slate-600 transition-colors">
          <Upload size={14}/> .ssg 불러오기
          <input type="file" onChange={importSSG} accept=".ssg,.json" className="hidden"/>
        </label>

        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="ml-auto flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 transition-colors hover:border-indigo-400 hover:bg-slate-700"
        >
          <Settings size={14} className="text-indigo-400" />
          AI 설정
          <span className={`rounded-full px-2 py-0.5 text-[10px] ${
            apiKeyStatus === 'valid'
              ? 'bg-emerald-500/20 text-emerald-300'
              : apiKey.trim()
                ? 'bg-amber-500/20 text-amber-300'
                : 'bg-slate-700 text-slate-400'
          }`}>
            {apiKeyStatus === 'valid' ? '연결됨' : apiKey.trim() ? '키 저장됨' : '키 필요'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
          className="flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-bold text-slate-200 transition-colors hover:border-indigo-400 hover:bg-slate-700"
          title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
          aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {theme === 'dark'
            ? <Sun size={14} className="text-amber-400" />
            : <Moon size={14} className="text-indigo-500" />}
          {theme === 'dark' ? '라이트' : '다크'}
        </button>
        
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
           <Settings size={14} className="text-slate-500"/>
           <span>자동저장:</span>
           <input type="number" min="0" value={autoSaveInterval} onChange={(e) => setAutoSaveInterval(Number(e.target.value))} className="w-10 bg-transparent border-b border-slate-600 text-center outline-none text-white focus:border-indigo-400"/>
           <span>분</span>
        </div>
      </nav>

      {showSettings && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false);
          }}
        >
          <section className="w-full max-w-xl overflow-hidden rounded-2xl border border-indigo-500/40 bg-[#161b22] shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-700 bg-[#0d1117] px-5 py-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-bold text-white">
                  <KeyRound size={18} className="text-indigo-400" />
                  Google AI Studio 설정
                </h2>
                <p className="mt-1 text-[11px] text-slate-400">
                  스토리 분석과 이미지 생성에 사용할 Gemini API 키를 설정합니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="설정 닫기"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-5 p-5">
              <div>
                <label className="mb-2 block text-xs font-bold text-slate-300">
                  Google AI Studio API Key
                </label>
                <div className="flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 focus-within:border-indigo-500">
                  <KeyRound size={15} className="shrink-0 text-indigo-400" />
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => {
                      setApiKey(e.target.value);
                      setApiKeySource('draft');
                      setApiKeyStatus(e.target.value.trim() ? 'saved' : 'empty');
                    }}
                    placeholder="비워두면 FMA Viewer 공통 키 사용"
                    autoComplete="off"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white outline-none placeholder:text-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey((prev) => !prev)}
                    className="rounded p-1 text-slate-400 hover:text-white"
                    aria-label={showApiKey ? 'API 키 숨기기' : 'API 키 보기'}
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                  Story Image 전용 키가 있으면 전용 키를 우선하며, 없으면 FMA Viewer 공통 키를 사용합니다.
                </p>
                <p className={`mt-1 text-[10px] font-bold ${
                  apiKeySource === 'app'
                    ? 'text-indigo-300'
                    : apiKeySource === 'shared'
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                }`}>
                  {apiKeySource === 'app'
                    ? '현재: Story Image 전용 키'
                    : apiKeySource === 'shared'
                      ? '현재: FMA Viewer 공통 키'
                      : apiKeySource === 'draft'
                        ? '입력 중: API 키 저장을 눌러 Story 전용 키로 적용'
                        : '현재: 연결된 API 키 없음'}
                </p>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <a
                  href={AI_STUDIO_API_KEY_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-3 text-xs font-bold text-indigo-300 hover:bg-indigo-500/20"
                >
                  <span className="flex items-center gap-2"><KeyRound size={15} /> API 키 발급·관리</span>
                  <ExternalLink size={14} />
                </a>
                <a
                  href={GEMINI_REFERENCE_APP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-xs font-bold text-slate-300 hover:bg-slate-700"
                >
                  <span className="flex items-center gap-2"><LinkIcon size={15} /> Gemini 참고 앱</span>
                  <ExternalLink size={14} />
                </a>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-700 pt-4">
                <button
                  type="button"
                  onClick={saveApiKey}
                  className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-indigo-500"
                >
                  API 키 저장
                </button>
                <button
                  type="button"
                  onClick={testApiKey}
                  disabled={!apiKey.trim() || isTestingApiKey}
                  className="flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-40"
                >
                  {isTestingApiKey && <Loader2 size={14} className="animate-spin" />}
                  연결 테스트
                </button>
                <button
                  type="button"
                  onClick={clearApiKey}
                  className="ml-auto rounded-xl px-3 py-2.5 text-xs font-bold text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  키 삭제
                </button>
              </div>

              <div className={`rounded-xl border px-4 py-3 text-xs ${
                apiKeyStatus === 'valid'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                  : apiKeyStatus === 'invalid'
                    ? 'border-red-500/30 bg-red-500/10 text-red-300'
                    : 'border-slate-700 bg-slate-900 text-slate-400'
              }`}>
                {apiKeyStatus === 'valid'
                  ? 'API 연결 확인 완료 — 스토리 분석과 이미지 생성이 가능합니다.'
                  : apiKeyStatus === 'invalid'
                    ? 'API 키를 확인하지 못했습니다. 키와 Google AI Studio 프로젝트 상태를 확인해 주세요.'
                    : apiKey.trim()
                      ? `${apiKeySource === 'shared' ? 'FMA Viewer 공통' : 'Story Image 전용'} API 키를 사용합니다. 연결 테스트로 사용 가능 여부를 확인할 수 있습니다.`
                      : '전용 키를 입력하거나 FMA Viewer 설정에서 공통 키를 적용해 주세요.'}
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Presentation Fullscreen Modal */}
      {showPresentation && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col animate-in fade-in duration-300">
            <div className="flex justify-between items-center p-4 text-white bg-slate-900 border-b border-slate-800">
                <h2 className="text-sm font-bold flex items-center gap-2"><MonitorPlay className="w-4 h-4 text-indigo-400"/> 스토리보드 프리젠테이션 모드</h2>
                <div className="flex items-center gap-4">
                  <span className="text-xs bg-slate-800 px-3 py-1 rounded-full">컷 {presIndex + 1} / {projectBoard.length}</span>
                  <button onClick={() => setShowPresentation(false)} className="p-1.5 hover:bg-red-500 rounded text-slate-300 hover:text-white transition-colors"><X/></button>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 relative bg-black/95">
                {projectBoard[presIndex] ? (
                    <img 
                      src={history.find(h=>h.id === projectBoard[presIndex])?.image} 
                      className="max-w-full max-h-full object-contain drop-shadow-2xl" 
                      style={{ filter: `brightness(${tuning.brightness}%) contrast(${tuning.contrast}%) saturate(${tuning.saturate}%) sepia(${tuning.sepia}%) hue-rotate(${tuning.hueRotate}deg)` }}
                    />
                ) : (
                    <div className="text-slate-600 border-2 border-dashed border-slate-700 p-12 rounded-xl flex flex-col items-center gap-3">
                      <ImageIcon className="w-12 h-12 opacity-50"/>
                      <span>이 슬롯에 할당된 컷이 없습니다.</span>
                    </div>
                )}
                
                <button onClick={() => setPresIndex(p => Math.max(0, p-1))} className="absolute left-6 p-4 bg-white/10 text-white rounded-full hover:bg-white/20 backdrop-blur-sm transition-all shadow-lg"><ChevronLeft size={36}/></button>
                <button onClick={() => setPresIndex(p => Math.min(projectBoard.length-1, p+1))} className="absolute right-6 p-4 bg-white/10 text-white rounded-full hover:bg-white/20 backdrop-blur-sm transition-all shadow-lg"><ChevronRight size={36}/></button>
            </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <header className="bg-[#161b22] rounded-2xl shadow-lg p-6 flex items-center gap-4 relative border border-slate-700 mb-6">
          <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl relative z-10"><Film className="w-8 h-8" /></div>
          <div className="relative z-10">
            <h1 className="text-2xl font-bold text-white">AI 스토리 시퀀스 제너레이터 <span className="text-sm font-medium bg-indigo-500/30 text-indigo-300 px-2 py-0.5 rounded-full align-middle">V14</span></h1>
            <p className="text-slate-400 mt-1">드래그 앤 드롭 및 백그라운드 렌더링, 접기 기능, 가로형 뷰어를 지원하는 최신 빌드입니다.</p>
          </div>
        </header>
        
        {error && <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-xl flex items-center gap-3 mb-6"><AlertCircle className="w-5 h-5 flex-shrink-0" /><p className="text-sm break-all">{error}</p></div>}
        
        {/* 입력 및 기획 부 (상단 2분할 레이아웃) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          
          {/* Left Column: Sources & Story Prompt */}
          <div className="space-y-6 flex flex-col h-full">
            
            {/* 1. 캐릭터 및 스타일 정의 컨테이너 */}
            <div className="bg-[#161b22] rounded-2xl shadow-sm border border-slate-700 overflow-hidden flex flex-col transition-all duration-300">
              <div 
                className="p-4 border-b border-slate-700 bg-[#0d1117] flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors" 
                onClick={() => toggleCollapse('character')}
              >
                <h2 className="text-md font-semibold flex items-center gap-2 text-white"><UserCheck className="w-4 h-4 text-indigo-400" /> 캐릭터 및 스타일 정의</h2>
                {collapsed.character ? <ChevronDown className="w-5 h-5 text-slate-400"/> : <ChevronUp className="w-5 h-5 text-slate-400"/>}
              </div>
              
              <div className={`transition-all duration-300 ${collapsed.character ? 'h-0 opacity-0' : 'h-auto opacity-100 p-5 space-y-4'}`}>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">메인 캐릭터 이미지 (다중 업로드 및 드래그 앤 드롭 지원)</label>
                  
                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-3 transition-colors ${isDragging ? 'border-indigo-500 bg-indigo-500/20' : 'border-slate-600 bg-slate-800/50 hover:bg-slate-700'}`}
                  >
                    {characterImages.length === 0 ? (
                      <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center cursor-pointer h-20">
                        <Upload className="w-5 h-5 text-slate-400 mb-2" />
                        <p className="text-[11px] font-medium text-slate-400 text-center">여기로 이미지를 드래그하거나<br/>클릭하여 여러 장 업로드</p>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {characterImages.map((img, idx) => (
                          <div key={idx} className="relative rounded-lg overflow-hidden bg-slate-900 border border-slate-600 w-16 h-16 group">
                            <img src={img.data} alt={`Character ${idx}`} className="w-full h-full object-cover" />
                            <button onClick={() => removeCharacterImage(idx)} className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="w-4 h-4 text-white"/>
                            </button>
                          </div>
                        ))}
                        <div onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-lg border-2 border-dashed border-slate-500 flex items-center justify-center cursor-pointer hover:bg-slate-600/50">
                           <Plus className="w-5 h-5 text-slate-400" />
                        </div>
                      </div>
                    )}
                  </div>
                  <input type="file" multiple ref={fileInputRef} onChange={handleCharacterFileChange} accept="image/*" className="hidden" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">캐릭터 텍스트 묘사 (일관성 보강)</label>
                  <input type="text" value={characterDescription} onChange={(e) => setCharacterDescription(e.target.value)} placeholder="예: 짧은 검은 머리, 안경을 쓴 20대 남성" className="w-full p-2 bg-slate-800 border border-slate-600 rounded-lg text-xs text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">전체 화풍 참조 이미지 (선택)</label>
                  {!uploadedStyle ? (
                    <div onClick={() => styleFileInputRef.current?.click()} className="border-2 border-dashed border-slate-600 bg-slate-800/50 rounded-xl p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-slate-700 transition-colors h-20"><Palette className="w-4 h-4 text-slate-400 mb-1" /><p className="text-[11px] font-medium text-slate-400">스타일 이미지 업로드</p></div>
                  ) : (
                    <div className="relative rounded-xl overflow-hidden bg-slate-800 border border-slate-600 flex items-center justify-center h-20">
                      <img src={uploadedStyle} alt="Style" className="w-full h-full object-contain p-1" />
                      <button onClick={() => setUploadedStyle(null)} className="absolute top-1 right-1 bg-black/60 text-white p-1 rounded hover:bg-black/80 transition-colors"><Trash2 className="w-3 h-3"/></button>
                    </div>
                  )}
                  <input type="file" ref={styleFileInputRef} onChange={(e) => handleFileUpload(e, setUploadedStyle, setStyleMimeType)} accept="image/*" className="hidden" />
                </div>
              </div>
            </div>

            {/* 2. 스토리 입력 및 기획 컨테이너 */}
            <div className="bg-[#161b22] rounded-2xl shadow-sm border border-slate-700 overflow-hidden flex flex-col transition-all duration-300">
              <div 
                className="p-4 border-b border-slate-700 bg-[#0d1117] flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors"
                onClick={() => toggleCollapse('story')}
              >
                <h2 className="text-md font-semibold flex items-center gap-2 text-white"><BookOpen className="w-4 h-4 text-indigo-400" /> 스토리 입력 및 기획</h2>
                <div className="flex items-center gap-3">
                  {/* V13: Story Text Import/Export (헤더에 배치) */}
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <div className="flex bg-slate-800 rounded border border-slate-700 overflow-hidden hidden sm:flex">
                      {['md', 'txt', 'html'].map(f => (
                        <button key={f} onClick={() => downloadStory(f)} className="text-[9px] font-bold px-2 py-1 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors border-r border-slate-700 last:border-0">{f.toUpperCase()} ↓</button>
                      ))}
                    </div>
                    <label className="text-[9px] font-bold px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded cursor-pointer transition-colors ml-1 hidden sm:block">
                      불러오기 ↑
                      <input type="file" accept=".md,.txt,.html" onChange={importStoryFile} className="hidden" />
                    </label>
                  </div>
                  {collapsed.story ? <ChevronDown className="w-5 h-5 text-slate-400"/> : <ChevronUp className="w-5 h-5 text-slate-400"/>}
                </div>
              </div>
              
              <div className={`transition-all duration-300 flex-1 flex flex-col ${collapsed.story ? 'h-0 opacity-0' : 'h-auto opacity-100 p-5 space-y-4'}`}>
                <div className="flex-1 flex flex-col">
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">기본 줄거리 입력 (불러온 텍스트 병합)</label>
                  <textarea value={storyOutline} onChange={(e) => setStoryOutline(e.target.value)} placeholder="이곳에 생성할 스토리의 줄거리를 상세히 작성해 주십시오. 텍스트 파일을 불러오면 여기에 병합됩니다." className="w-full flex-1 min-h-[120px] p-3 bg-slate-800 border border-slate-600 rounded-xl text-sm text-white resize-none outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500" />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-300">생성할 컷(장면) 수:</label>
                  <div className="flex items-center gap-2">
                    {[4, 8, 12, 16].map(num => (
                      <button key={num} onClick={() => setSceneCount(num)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${Number(sceneCount) === num ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                        {num}컷
                      </button>
                    ))}
                    <div className="flex items-center border border-slate-600 rounded-lg bg-slate-800 px-2 py-1 flex-1">
                      <input type="number" min="1" max="50" value={sceneCount} onChange={(e) => setSceneCount(e.target.value)} className="w-full bg-transparent text-xs text-white outline-none text-center" placeholder="직접입력" />
                      <span className="text-xs text-slate-400 ml-1">컷</span>
                    </div>
                  </div>
                </div>

                <button onClick={generateStoryScenes} disabled={isGeneratingStory || isGenerating || isBatchGenerating} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-500 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors mt-2">
                  {isGeneratingStory ? <Loader2 className="w-4 h-4 animate-spin" /> : <ListOrdered className="w-4 h-4" />} 스토리장면생성
                </button>
                {isGeneratingStory && (<button onClick={cancelGeneration} className="w-full py-2 text-xs text-red-400 font-medium hover:text-red-300 text-center">분할 취소</button>)}
              </div>
            </div>

          </div>

          {/* Right Column: Scenes List & Editor */}
          <div className="space-y-6 flex flex-col h-full">
            <div className={`bg-[#161b22] rounded-2xl shadow-sm border border-slate-700 overflow-hidden flex flex-col transition-all duration-300 ${!collapsed.scene ? 'h-full min-h-[600px]' : ''}`}>
              
              <div 
                className="p-4 border-b border-slate-700 bg-[#0d1117] flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors"
                onClick={() => toggleCollapse('scene')}
              >
                <h2 className="text-md font-semibold text-white flex items-center gap-2"><Layers className="w-4 h-4 text-indigo-400"/> 장면(Scene) 편집기</h2>
                <div className="flex items-center gap-3">
                  {storyScenes.length > 0 && (
                    <button onClick={(e) => { e.stopPropagation(); generateBatchScenes(); }} disabled={isBatchGenerating || isGenerating} className="text-xs bg-indigo-500/20 text-indigo-300 px-3 py-1.5 rounded-lg font-bold hover:bg-indigo-500/40 disabled:opacity-50 flex items-center gap-1 transition-colors">
                      <Play className="w-3.5 h-3.5" /> 전체 렌더링
                    </button>
                  )}
                  {collapsed.scene ? <ChevronDown className="w-5 h-5 text-slate-400"/> : <ChevronUp className="w-5 h-5 text-slate-400"/>}
                </div>
              </div>

              <div className={`transition-all duration-300 flex-1 flex flex-col ${collapsed.scene ? 'h-0 opacity-0 overflow-hidden' : 'h-auto opacity-100'}`}>
                {storyScenes.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-6 text-center min-h-[400px]">
                    <BookOpen className="w-12 h-12 mb-3 opacity-20" />
                    <p className="text-sm">좌측에서 '스토리장면생성'을 실행하면<br/>장면 프롬프트 편집기가 활성화됩니다.</p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto flex flex-col scrollbar-thin">
                    <div className="flex overflow-x-auto p-2 bg-[#0d1117] gap-1 border-b border-slate-700 scrollbar-hide">
                      {storyScenes.map((scene, idx) => (
                        <button key={idx} onClick={() => setActiveSceneIndex(idx)} className={`whitespace-nowrap px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeSceneIndex === idx ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                          컷 {scene.id}
                        </button>
                      ))}
                    </div>

                    {storyScenes[activeSceneIndex] && (
                      <div className="p-5 space-y-4 animate-in fade-in duration-300">
                        
                        <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 space-y-3 mb-2">
                          <div className="flex justify-between items-center">
                             <span className="text-xs font-bold text-slate-300">공통 렌더링 설정</span>
                          </div>
                          <div className="flex gap-2">
                            <select value={imageStyle} onChange={(e) => setImageStyle(e.target.value)} className="flex-1 p-1.5 text-xs border border-slate-600 rounded outline-none bg-slate-900 text-white">
                              <option value="photo">실사 사진 (Photo)</option>
                              <option value="semi-realistic">반실사 (2.5D)</option>
                              <option value="animation">웹툰/애니메이션</option>
                            </select>
                            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value)} className="flex-1 p-1.5 text-xs border border-slate-600 rounded outline-none bg-slate-900 text-white">
                              <option value="16:9">가로 (16:9)</option>
                              <option value="9:16">세로 (9:16)</option>
                              <option value="1:1">정사각형 (1:1)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-indigo-400 flex items-center gap-1"><ImageIcon className="w-3 h-3"/> 배경 (Background)</label>
                          <textarea value={storyScenes[activeSceneIndex].background} onChange={(e) => updateScene(activeSceneIndex, 'background', e.target.value)} className="w-full p-2 text-xs bg-[#0d1117] border border-slate-600 text-white rounded-lg outline-none focus:border-indigo-500 h-16 resize-none leading-relaxed" />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-indigo-400 flex items-center gap-1"><ScanFace className="w-3 h-3"/> 포즈 및 행동 (Pose & Action)</label>
                          <textarea value={storyScenes[activeSceneIndex].pose} onChange={(e) => updateScene(activeSceneIndex, 'pose', e.target.value)} className="w-full p-2 text-xs bg-[#0d1117] border border-slate-600 text-white rounded-lg outline-none focus:border-indigo-500 h-16 resize-none leading-relaxed" />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-indigo-400 flex items-center gap-1"><Shirt className="w-3 h-3"/> 의상 (Clothing)</label>
                          <input type="text" value={storyScenes[activeSceneIndex].clothing} onChange={(e) => updateScene(activeSceneIndex, 'clothing', e.target.value)} className="w-full p-2 text-xs bg-[#0d1117] border border-slate-600 text-white rounded-lg outline-none focus:border-indigo-500" />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-indigo-400 flex items-center gap-1"><Plus className="w-3 h-3"/> 추가 요소 및 인물 (Elements)</label>
                          <input type="text" value={storyScenes[activeSceneIndex].elements} onChange={(e) => updateScene(activeSceneIndex, 'elements', e.target.value)} className="w-full p-2 text-xs bg-[#0d1117] border border-slate-600 text-white rounded-lg outline-none focus:border-indigo-500" />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-pink-400 flex items-center gap-1"><FileText className="w-3 h-3"/> 추가 요구사항 (Additional Prompt)</label>
                          <input type="text" value={storyScenes[activeSceneIndex].additionalPrompt || ''} onChange={(e) => updateScene(activeSceneIndex, 'additionalPrompt', e.target.value)} placeholder="렌더링 시 추가로 강제할 구체적인 요소를 입력하세요" className="w-full p-2 text-xs bg-[#0d1117] border border-slate-600 text-white rounded-lg outline-none focus:border-pink-500" />
                        </div>

                        <div className="pt-4 border-t border-slate-700">
                          <button onClick={handleGenerateCurrentScene} disabled={isGenerating || isBatchGenerating} className="w-full bg-slate-700 text-white py-3 rounded-xl font-bold hover:bg-slate-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                            {isGenerating && !isBatchGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} 현재 컷({storyScenes[activeSceneIndex].id}) 단일 생성
                          </button>
                        </div>

                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>


        {/* 출력 및 보드 영역 (하단 전체 길이로 배치) */}
        
        {/* 프로젝트 보드 (가장 먼저 조립되어 완성되는 모습을 상단에 배치) */}
        {projectBoard.length > 0 && (
          <div className="bg-[#161b22] rounded-2xl shadow-lg border border-indigo-500/40 overflow-hidden mb-6 transition-all duration-300">
            <div 
              className="p-4 bg-[#0d1117] border-b border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => toggleCollapse('board')}
            >
              <div className="flex items-center gap-4">
                 <h2 className="text-lg font-bold flex items-center gap-2 text-white"><LayoutList className="w-5 h-5 text-indigo-400" /> 프로젝트 보드 (최종 스토리보드 완성)</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 hidden sm:flex" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setShowPresentation(true)} className="flex items-center gap-1.5 bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm">
                      <MonitorPlay size={14}/> 슬라이드
                  </button>
                  <label className="flex items-center gap-2 bg-slate-800 border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-colors">
                    <Upload className="w-4 h-4" /> ZIP 불러오기
                    <input type="file" accept=".zip" onChange={importProjectBoardZip} className="hidden" />
                  </label>
                  <button onClick={downloadProjectZip} disabled={!librariesLoaded || projectBoard.every(id => id === null)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-1.5 rounded-lg hover:bg-indigo-500 disabled:opacity-50 text-xs font-bold transition-colors">
                    <Archive className="w-4 h-4" /> ZIP 다운로드
                  </button>
                </div>
                {collapsed.board ? <ChevronDown className="w-5 h-5 text-slate-400"/> : <ChevronUp className="w-5 h-5 text-slate-400"/>}
              </div>
            </div>
            
            <div className={`transition-all duration-300 ${collapsed.board ? 'h-0 opacity-0 overflow-hidden' : 'h-auto opacity-100 p-6'}`}>
              <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
                {projectBoard.map((historyId, idx) => {
                  const item = history.find(h => h.id === historyId);
                  return (
                    <div key={idx} className={`flex-shrink-0 w-48 flex flex-col border-2 rounded-xl overflow-hidden transition-all ${item ? 'border-indigo-500/50 bg-[#0d1117]' : 'border-dashed border-slate-600 bg-slate-800/30'}`}>
                      <div className="bg-slate-800 py-1.5 px-3 flex justify-between items-center border-b border-slate-700">
                         <span className="text-xs font-bold text-slate-300">컷 {idx + 1}</span>
                         {item && <button onClick={()=>unassignFromProjectBoard(idx)} className="text-[10px] text-slate-400 hover:text-red-400"><XCircle className="w-3.5 h-3.5"/></button>}
                      </div>
                      <div className="h-40 flex items-center justify-center p-2 relative">
                        {item ? (
                          <img src={item.image} alt={`Cut ${idx+1}`} style={{ filter: `brightness(${tuning.brightness}%) contrast(${tuning.contrast}%) saturate(${tuning.saturate}%) sepia(${tuning.sepia}%) hue-rotate(${tuning.hueRotate}deg)` }} className="w-full h-full object-cover rounded" />
                        ) : (
                          <div className="text-center">
                             <p className="text-[11px] text-slate-500 font-medium">비어있는 슬롯</p>
                             {activeResult && <button onClick={()=>assignToProjectBoard(idx)} className="mt-2 text-[10px] bg-slate-700 text-slate-300 px-2 py-1 rounded hover:bg-indigo-600 hover:text-white transition-colors">현재 뷰어 이미지 할당</button>}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5"/> 하단의 '생성된 시퀀스 풀'에서 마음에 드는 이미지를 뷰어로 불러온 후 위 보드의 슬롯에 할당하여 최종본을 구성하세요.</p>
            </div>
          </div>
        )}

        {/* 실시간 결과물 뷰어 (가로로 넓게 배치) */}
        <div className="bg-[#161b22] rounded-2xl shadow-lg border border-indigo-500/30 overflow-hidden mb-6 transition-all duration-300" id="result-viewer">
          <div 
            className="p-4 bg-[#0d1117] border-b border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors"
            onClick={() => toggleCollapse('viewer')}
          >
             <h2 className="text-lg font-bold flex items-center gap-2 text-white"><Focus className="w-5 h-5 text-indigo-400" /> 실시간 렌더링 뷰어 & 이미지 튜닝</h2>
             <div className="flex items-center gap-3">
                {activeResult && (
                  <button onClick={(e) => {
                    e.stopPropagation();
                    const newWin = window.open();
                    newWin?.document.write(`<html><body style="margin:0;background:#111;display:flex;justify-content:center;align-items:center;height:100vh;"><img src="${activeResult.image}" style="max-height:100%;max-width:100%;object-fit:contain; filter: brightness(${tuning.brightness}%) contrast(${tuning.contrast}%) saturate(${tuning.saturate}%) sepia(${tuning.sepia}%) hue-rotate(${tuning.hueRotate}deg);"/></body></html>`);
                  }} className="text-[11px] font-bold flex items-center gap-1 text-slate-400 hover:text-indigo-400 px-2 hidden sm:flex"><ExternalLink className="w-3.5 h-3.5" /> 새창</button>
                )}
                {collapsed.viewer ? <ChevronDown className="w-5 h-5 text-slate-400"/> : <ChevronUp className="w-5 h-5 text-slate-400"/>}
             </div>
          </div>

          <div className={`transition-all duration-300 ${collapsed.viewer ? 'h-0 opacity-0 overflow-hidden' : 'h-auto opacity-100 p-5'}`}>
            {/* 진행상태 표시기 */}
            {(isGenerating || isBatchGenerating || isGeneratingStory) && (
              <div className="mb-4 bg-indigo-900/30 border border-indigo-500/30 rounded-xl p-4 flex flex-col items-center justify-center">
                 <div className="flex items-center gap-2 mb-2"><Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /><p className="text-xs font-bold text-indigo-300">{progressMessage}</p></div>
                 <div className="w-full bg-slate-800 rounded-full h-1.5 mb-2 overflow-hidden"><div className="bg-indigo-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div></div>
                 <div className="flex justify-between items-center w-full mt-1">
                   <span className="text-[10px] text-indigo-400 font-bold">{Math.round(progress)}%</span>
                   <button onClick={cancelGeneration} className="text-[10px] bg-red-500/20 text-red-400 px-2 py-1 rounded hover:bg-red-500/40 font-bold transition-colors">중지</button>
                 </div>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-6 h-[450px]">
              {/* Image Area */}
              <div className="flex-1 rounded-xl overflow-hidden bg-[#0d1117] border border-slate-700 flex justify-center items-center relative p-2">
                {!activeResult ? (
                   <div className="text-center text-slate-600"><ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-50" /><p className="text-sm">렌더링된 컷이 여기에 표시됩니다</p></div>
                ) : (
                  <img src={activeResult.image} alt="Scene" 
                       style={{ filter: `brightness(${tuning.brightness}%) contrast(${tuning.contrast}%) saturate(${tuning.saturate}%) sepia(${tuning.sepia}%) hue-rotate(${tuning.hueRotate}deg)` }}
                       className="max-w-full max-h-full object-contain drop-shadow-md rounded-lg transition-all duration-200" />
                )}
              </div>
              
              {/* Tuning Area */}
              <div className="w-full md:w-80 bg-[#0d1117] p-5 rounded-xl border border-slate-700 flex flex-col overflow-y-auto">
                <h3 className="text-xs font-bold text-green-400 flex items-center gap-1.5 mb-4"><Sliders className="w-4 h-4"/> 실시간 톤 및 필터 조정</h3>
                
                <div className="space-y-5">
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-400 font-semibold mb-1">감성 프리셋 퀵셀렉터</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={()=>applyPreset('original')} className="py-2 text-[11px] bg-slate-800 border border-slate-600 rounded hover:border-green-400 text-slate-300 transition-colors">원본 보존</button>
                      <button onClick={()=>applyPreset('semi-real')} className="py-2 text-[11px] bg-slate-800 border border-slate-600 rounded hover:border-green-400 text-slate-300 transition-colors">자연스런 반실사</button>
                      <button onClick={()=>applyPreset('pastel')} className="py-2 text-[11px] bg-slate-800 border border-green-500/50 rounded hover:border-green-400 text-green-300 transition-colors">소프트 파스텔</button>
                      <button onClick={()=>applyPreset('warm')} className="py-2 text-[11px] bg-slate-800 border border-slate-600 rounded hover:border-green-400 text-slate-300 transition-colors">웜 무드</button>
                      <button onClick={()=>applyPreset('cool')} className="py-2 text-[11px] bg-slate-800 border border-slate-600 rounded hover:border-green-400 text-slate-300 transition-colors">쿨 일러스트</button>
                      <button onClick={()=>applyPreset('cinematic')} className="py-2 text-[11px] bg-slate-800 border border-slate-600 rounded hover:border-green-400 text-slate-300 transition-colors">시네마틱 피치</button>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1.5"><span>밝기 (Brightness)</span><span className="text-green-400">{tuning.brightness}%</span></div>
                      <input type="range" min="50" max="150" value={tuning.brightness} onChange={(e)=>setTuning({...tuning, brightness: e.target.value})} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-400" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1.5"><span>대비 (Contrast)</span><span className="text-green-400">{tuning.contrast}%</span></div>
                      <input type="range" min="50" max="150" value={tuning.contrast} onChange={(e)=>setTuning({...tuning, contrast: e.target.value})} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-400" />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-400 mb-1.5"><span>채도 (Saturation)</span><span className="text-green-400">{tuning.saturate}%</span></div>
                      <input type="range" min="0" max="200" value={tuning.saturate} onChange={(e)=>setTuning({...tuning, saturate: e.target.value})} className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-green-400" />
                    </div>
                  </div>
                </div>
                
                <div className="mt-auto pt-4 border-t border-slate-700">
                  <button onClick={downloadSingleTunedImage} disabled={!activeResult || isGenerating} className="w-full flex justify-center items-center gap-2 text-sm font-bold bg-green-500/20 text-green-400 border border-green-500/30 px-3 py-3 rounded-xl hover:bg-green-500/30 transition-colors disabled:opacity-50">
                    <Download className="w-5 h-5" /> 현재 튜닝 이미지 다운로드
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 시퀀스 풀 (가장 하단에 배치) */}
        {history.length > 0 && (
          <div className="bg-[#161b22] rounded-2xl shadow-sm border border-slate-700 overflow-hidden mb-6 transition-all duration-300">
            <div 
              className="p-4 bg-[#0d1117] border-b border-slate-700 flex justify-between items-center cursor-pointer hover:bg-slate-800 transition-colors"
              onClick={() => toggleCollapse('pool')}
            >
              <div className="flex items-center gap-4">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-white"><History className="w-5 h-5 text-slate-400" /> 생성된 시퀀스 풀 (Generated Pool)</h2>
                <span className="text-xs text-slate-500 hidden sm:inline">클릭하여 뷰어로 전송하고 보드에 할당하십시오.</span>
              </div>
              
              <div className="flex items-center gap-3">
                <button 
                  onClick={(e) => { e.stopPropagation(); downloadSequencePoolZip(); }} 
                  disabled={!librariesLoaded || history.length === 0} 
                  className="flex items-center gap-2 bg-slate-800 border border-slate-600 text-slate-300 px-4 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50 text-xs font-bold transition-colors hidden sm:flex"
                >
                  <Download className="w-4 h-4" /> 전체 시퀀스 다운로드
                </button>
                {collapsed.pool ? <ChevronDown className="w-5 h-5 text-slate-400"/> : <ChevronUp className="w-5 h-5 text-slate-400"/>}
              </div>
            </div>

            <div className={`transition-all duration-300 ${collapsed.pool ? 'h-0 opacity-0 overflow-hidden' : 'h-auto opacity-100 p-6'}`}>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {[...history].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((item) => (
                  <div key={item.id} onClick={() => { setSelectedResultId(item.id); document.getElementById('result-viewer')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className={`border rounded-lg overflow-hidden flex flex-col cursor-pointer transition-all hover:-translate-y-1 bg-[#0d1117] relative ${selectedResultId === item.id ? 'ring-2 ring-indigo-500 border-transparent shadow-md opacity-100 scale-105' : 'border-slate-700 opacity-70 hover:opacity-100'}`}>
                    <div className="flex h-24 bg-slate-800 p-0.5 border-b border-slate-700 group relative">
                       <div className="flex-1 overflow-hidden bg-slate-900 flex items-center justify-center relative">
                          <span className="absolute top-1 left-1 bg-black/80 text-white text-[10px] px-2 py-0.5 rounded font-bold z-10">컷 {item.sceneIndex + 1}</span>
                          <img src={item.image} alt="Comp" className="w-full h-full object-cover" />
                       </div>
                       {addonMode && (
                         <button
                           type="button"
                           onClick={(e) => { e.stopPropagation(); toggleSendSelection(item.id); }}
                           className={`absolute top-1 right-1 z-20 flex h-7 w-7 items-center justify-center rounded-full border shadow-lg transition-colors ${
                             selectedSendIds.includes(item.id)
                               ? 'border-emerald-300 bg-emerald-500 text-white'
                               : 'border-slate-500 bg-black/70 text-slate-300 hover:border-emerald-400'
                           }`}
                           title={selectedSendIds.includes(item.id) ? '보내기 선택 해제' : '메인 앱으로 보낼 이미지 선택'}
                           aria-label={selectedSendIds.includes(item.id) ? '보내기 선택 해제' : '메인 앱으로 보낼 이미지 선택'}
                         >
                           <CheckCircle2 size={16} />
                         </button>
                       )}
                       {/* Direct Download Button */}
                       <button 
                          onClick={(e) => { e.stopPropagation(); downloadDirectImage(item); }} 
                          className="absolute bottom-1 right-1 bg-black/70 hover:bg-indigo-600 text-white p-1.5 rounded transition-colors opacity-0 group-hover:opacity-100 z-10 shadow-lg"
                          title="원본 직접 다운로드"
                       >
                         <Download size={14} />
                       </button>
                    </div>
                    <div className="p-2 flex-1 flex flex-col justify-center bg-[#0d1117]">
                      <p className="text-[10px] font-medium text-slate-400 line-clamp-2 leading-tight" title={item.promptInfo}>{item.promptInfo}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Toast Notification Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className="bg-slate-800 border border-indigo-500/50 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300 pointer-events-auto">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <p className="text-sm font-medium">{toast.msg}</p>
          </div>
        ))}
      </div>

      {addonMode && (
        <div className="fixed bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-indigo-400/50 bg-slate-950/95 px-5 py-3 shadow-2xl backdrop-blur">
          <span className="text-xs font-bold text-slate-300">선택 {selectedSendIds.length}장</span>
          <button
            type="button"
            onClick={() => sendSelectedImages()}
            disabled={selectedSendIds.length === 0}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-black text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send size={17} />
            선택 이미지 보내기
          </button>
          <button
            type="button"
            onClick={() => sendAllHistoryImages()}
            disabled={history.length === 0}
            className="flex items-center gap-2 rounded-xl border border-indigo-400/50 bg-slate-800 px-4 py-2.5 text-sm font-black text-indigo-100 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Images size={17} />
            히스토리 모두 보내기
          </button>
        </div>
      )}

    </div>
  );
}
