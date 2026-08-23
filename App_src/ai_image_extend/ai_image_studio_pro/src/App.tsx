import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, Image as ImageIcon, Maximize, Crop, Sliders, History, 
  Download, Loader2, ArrowUp, ArrowDown, ArrowLeft, ArrowRight, 
  Maximize2, Camera, User, CheckCircle2, X, Play, MoveHorizontal, MoveVertical, Sparkles, ImagePlus
} from 'lucide-react';

// FMA Viewer가 보관한 키는 빌드 결과에 기록하지 않고 실행 중 postMessage로만 받는다.
const geminiUrl = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '9:16', value: '9:16' },
  { label: '16:9', value: '16:9' },
];

const EXTEND_DIRECTIONS = [
  { label: '전체', value: 'all', icon: Maximize2 },
  { label: '좌우', value: 'horizontal', icon: MoveHorizontal },
  { label: '상하', value: 'vertical', icon: MoveVertical },
  { label: '상단', value: 'up', icon: ArrowUp },
  { label: '하단', value: 'down', icon: ArrowDown },
  { label: '좌측', value: 'left', icon: ArrowLeft },
  { label: '우측', value: 'right', icon: ArrowRight },
];

const UPSCALE_LEVELS = [
  { label: '없음', value: 1 },
  { label: '2x', value: 2 },
  { label: '4x', value: 4 },
];

const CAMERA_ANGLES = ['자동', '아이레벨(눈높이)', '하이앵글(위에서)', '로우앵글(아래서)'];
const CAMERA_SCOPES = ['자동', '클로즈업(얼굴)', '바스트샷(가슴)', '웨이스트샷(허리)', '풀샷(전신)'];

// 프리셋 리스트 (드롭다운 대신 버튼 형태로 제공하기 위해 구조화)
const PRESETS = {
  emotion: ['무표정', '미소', '활짝 웃음', '슬픔', '몽환적'],
  pose: ['정면 서기', '뒤돌아보기', '의자에 앉기', '무릎 꿇기'],
};

// --- [API 유틸리티] ---
const fetchWithRetry = async (url, options, retries = 5) => {
  const delays = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, delays[i]));
    }
  }
};

export default function AIImageStudio() {
  // --- [상태 관리] ---
  const [sourceImage, setSourceImage] = useState(null); 
  const [sourceSize, setSourceSize] = useState({ width: 0, height: 0 });
  const [mobileMenuOpen, setMobileMenuOpen] = useState('main'); 
  
  const [params, setParams] = useState({
    targetRatio: '1:1',
    extendDirection: 'horizontal',
    upscaleLevel: 1,
    emotion: '',
    hair: '',
    tryOn: '',
    pose: '',
    cameraAngle: '자동',
    cameraScope: '자동',
    detailPrompt: '',
    autoPrompt: '',
  });

  const [analyzingStatus, setAnalyzingStatus] = useState({
    emotion: false,
    hair: false,
    tryOn: false,
    pose: false
  });

  const [tasks, setTasks] = useState([]); 
  const [history, setHistory] = useState([]);
  const [activeTab, setActiveTab] = useState('size');
  const [apiKey, setApiKey] = useState('');
  const [apiKeyEnabled, setApiKeyEnabled] = useState(true);
  const [bridgeMessage, setBridgeMessage] = useState('FMA API 키 연결 대기 중');
  const historyRef = useRef([]);

  // 각 파일 입력 요소 참조
  const fileInputRefs = {
    emotion: useRef(null),
    pose: useRef(null),
    hair: useRef(null),
    tryOn: useRef(null),
  };

  useEffect(() => { historyRef.current = history; }, [history]);

  const applySourceImage = (dataUrl) => {
    if (!String(dataUrl || '').startsWith('data:image')) return;
    const img = new Image();
    img.onload = () => {
      setSourceSize({ width: img.width, height: img.height });
      setSourceImage(dataUrl);
      setBridgeMessage('FMA 이미지를 불러왔습니다.');
    };
    img.src = dataUrl;
  };

  useEffect(() => {
    const postToHost = payload => {
      if (window.parent !== window) window.parent.postMessage({ app: 'imageExtend', ...payload }, '*');
    };
    const requestCurrentImage = () => postToHost({
      type: 'fma-app-request-source-images',
      requestId: `image-extend-source-${Date.now()}`,
      mode: 'current'
    });
    const onMessage = event => {
      if (event.source !== window.parent) return;
      const data = event.data || {};
      if (data.type === 'fma-app-shared-api-key-updated') {
        setApiKey(String(data.key || '').trim());
        setApiKeyEnabled(data.enabled !== false);
        setBridgeMessage(data.key && data.enabled !== false
          ? 'FMA API 키 연결됨'
          : data.enabled === false ? 'FMA 설정에서 API 키 사용이 중지됨' : 'FMA 설정에 API 키가 없습니다.');
      } else if (data.type === 'fma-app-host-ready') {
        postToHost({ type: 'fma-app-request-shared-api-key' });
        requestCurrentImage();
      } else if (data.type === 'fma-app-source-images') {
        const first = Array.isArray(data.images) ? data.images[0] : null;
        if (first?.dataUrl) applySourceImage(first.dataUrl);
      } else if (data.type === 'fma-app-request-images') {
        const items = data.mode === 'all' ? historyRef.current : historyRef.current.slice(0, 1);
        postToHost({
          type: 'fma-app-images',
          requestId: data.requestId,
          images: items.map(item => ({ dataUrl: item.outputImage, name: `imageExtend_${item.id}.jpg` }))
        });
      }
    };
    window.addEventListener('message', onMessage);
    postToHost({ type: 'fma-app-ready' });
    postToHost({ type: 'fma-app-request-shared-api-key' });
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // --- [자동 프롬프트 생성 엔진 (Auto Prompt Generator)] ---
  useEffect(() => {
    let generated = "Seamless outpainting. Highly detailed, photorealistic. ";
    
    switch(params.extendDirection) {
      case 'horizontal': generated += "Fill left and right blank areas. Generate missing arms, elbows, and shoulders seamlessly. Extend the background. "; break;
      case 'vertical': generated += "Fill top and bottom blank areas. Generate top of hair and lower body naturally. "; break;
      case 'all': generated += "Fill all blank margins. Generate missing body parts (arms, shoulders, legs) and extend environment seamlessly. "; break;
      case 'left': generated += "Generate missing left arm and shoulder. Extend left background. "; break;
      case 'right': generated += "Generate missing right arm and shoulder. Extend right background. "; break;
      case 'up': generated += "Generate top of head, complete hair details. Extend upper background. "; break;
      case 'down': generated += "Complete lower body, generate legs and shoes. Extend ground. "; break;
    }

    if (params.pose) generated += `${params.pose} pose, `;
    if (params.emotion) generated += `${params.emotion} expression, `;
    if (params.hair) generated += `${params.hair} hairstyle, `;
    if (params.tryOn) generated += `wearing ${params.tryOn}, `;
    if (params.detailPrompt) generated += `${params.detailPrompt}. `;

    setParams(prev => ({ ...prev, autoPrompt: generated.trim() }));
  }, [
    params.extendDirection, params.pose, params.emotion, 
    params.hair, params.tryOn, params.detailPrompt
  ]);

  // --- [핸들러] ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setSourceSize({ width: img.width, height: img.height });
          setSourceImage(event.target.result);
          if (window.innerWidth < 1024) setMobileMenuOpen('main');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const updateParam = (key, value) => setParams(prev => ({ ...prev, [key]: value }));

  // 참고 이미지 업로드 및 분석 처리
  const handleReferenceImageUpload = (category, e) => {
    const file = e.target.files[0];
    if (!file) return;

    setAnalyzingStatus(prev => ({ ...prev, [category]: true }));

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const base64Data = event.target.result.split(',')[1];
        const categoryPromptMap = {
          emotion: "facial expression and emotion",
          pose: "body pose and posture",
          hair: "hairstyle and hair color",
          tryOn: "clothing and outfit",
        };

        const promptText = `Analyze the ${categoryPromptMap[category]} of the person in this image. Write a very short, descriptive English phrase (e.g. "smiling face with closed eyes", "wearing a black suit", "short wavy brown hair") that can be used directly as an image generation prompt. Output only the short phrase without any additional conversation.`;

        const payload = {
          contents: [{
            parts: [
              { text: promptText },
              { inlineData: { mimeType: file.type || "image/jpeg", data: base64Data } }
            ]
          }]
        };

        if (!apiKey || !apiKeyEnabled) throw new Error('FMA API 키를 먼저 연결하세요.');
        const result = await fetchWithRetry(geminiUrl('gemini-3.7-flash', apiKey), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const extractedText = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (extractedText) {
          updateParam(category, extractedText.trim().replace(/\n/g, ''));
        }
      } catch (error) {
        console.error(`Image analysis failed for ${category}:`, error);
        // 에러 처리: 필요시 사용자 알림 로직 추가
      } finally {
        setAnalyzingStatus(prev => ({ ...prev, [category]: false }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerate = () => {
    if (!sourceImage) return;
    if (!apiKey || !apiKeyEnabled) {
      setBridgeMessage(apiKeyEnabled ? 'FMA 설정에 Google AI Studio API 키를 입력하세요.' : 'FMA 설정에서 API 키 사용을 시작하세요.');
      return;
    }
    const newTask = {
      id: Date.now().toString(),
      status: 'pending', 
      progress: 0,
      sourceImage,
      params: { ...params },
      createdAt: new Date(),
    };
    setTasks(prev => [...prev, newTask]);
    if (window.innerWidth < 1024) setMobileMenuOpen('history');
  };

  // --- [코어 엔진: Gemini API 아웃페인팅 처리] ---
  useEffect(() => {
    const processTask = async (task) => {
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'processing', progress: 0 } : t));
      
      let currentProgress = 0;
      const progressTimer = setInterval(() => {
        if (currentProgress < 85) {
          currentProgress += Math.random() * 2;
          setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: Math.min(Math.round(currentProgress), 85) } : t));
        }
      }, 400);

      const processImage = new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = async () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            
            // 커스텀 비율 파싱 로직 포함
            let tgtW = 1, tgtH = 1;
            const ratioStr = task.params.targetRatio;
            if (ratioStr.includes(':')) {
              const parts = ratioStr.split(':');
              tgtW = parseFloat(parts[0]) || 1;
              tgtH = parseFloat(parts[1]) || 1;
            }
            const tgtRatio = tgtW / tgtH;
            const srcRatio = img.width / img.height;

            let newWidth, newHeight;
            if (srcRatio > tgtRatio) {
              newWidth = img.width;
              newHeight = img.width / tgtRatio;
            } else {
              newHeight = img.height;
              newWidth = img.height * tgtRatio;
            }

            canvas.width = newWidth * task.params.upscaleLevel;
            canvas.height = newHeight * task.params.upscaleLevel;
            const scaledImgW = img.width * task.params.upscaleLevel;
            const scaledImgH = img.height * task.params.upscaleLevel;

            let dx = 0, dy = 0;
            switch (task.params.extendDirection) {
              case 'up': dy = canvas.height - scaledImgH; dx = (canvas.width - scaledImgW) / 2; break;
              case 'down': dy = 0; dx = (canvas.width - scaledImgW) / 2; break;
              case 'left': dx = canvas.width - scaledImgW; dy = (canvas.height - scaledImgH) / 2; break;
              case 'right': dx = 0; dy = (canvas.height - scaledImgH) / 2; break;
              default: dx = (canvas.width - scaledImgW) / 2; dy = (canvas.height - scaledImgH) / 2; break;
            }

            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, dx, dy, scaledImgW, scaledImgH);

            const base64Data = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
            const prompt = `This is an image placed on a larger white canvas. Please replace the white margins by outpainting and generating the missing body parts, arms, and background naturally. Maintain the exact style and identity of the original center image. ${task.params.autoPrompt}`;

            const payload = {
              contents: [{
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: "image/jpeg", data: base64Data } }
                ]
              }],
              generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
            };

            const result = await fetchWithRetry(geminiUrl('gemini-3.1-flash-image', apiKey), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            const generatedBase64 = result?.candidates?.[0]?.content?.parts?.find(p => p.inlineData)?.inlineData?.data;
            
            if (generatedBase64) {
              const genImg = new Image();
              genImg.onload = () => {
                ctx.drawImage(genImg, 0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, dx, dy, scaledImgW, scaledImgH); // 원본 보존 복원
                resolve({ imgData: canvas.toDataURL('image/jpeg', 0.95), type: 'ai' });
              };
              genImg.src = `data:image/jpeg;base64,${generatedBase64}`;
            } else {
              throw new Error("API 응답 없음");
            }
          } catch (error) {
            // 폴백 (미러링) 로직
            const fbCanvas = document.createElement('canvas');
            const fbCtx = fbCanvas.getContext('2d');
            
            let tgtW = 1, tgtH = 1;
            const ratioStr = task.params.targetRatio;
            if (ratioStr.includes(':')) {
              const parts = ratioStr.split(':');
              tgtW = parseFloat(parts[0]) || 1;
              tgtH = parseFloat(parts[1]) || 1;
            }
            const tgtRatio = tgtW / tgtH;
            
            let w, h;
            if (img.width / img.height > tgtRatio) {
              w = img.width; h = img.width / tgtRatio;
            } else {
              h = img.height; w = img.height * tgtRatio;
            }
            fbCanvas.width = w; fbCanvas.height = h;
            let sx = (fbCanvas.width - img.width) / 2;
            let sy = (fbCanvas.height - img.height) / 2;

            fbCtx.fillStyle = '#0f172a';
            fbCtx.fillRect(0, 0, fbCanvas.width, fbCanvas.height);
            fbCtx.globalAlpha = 0.7;
            if (sx > 0) {
              fbCtx.save(); fbCtx.scale(-1, 1); fbCtx.drawImage(img, 0, 0, 40, img.height, -sx, sy, sx, img.height); fbCtx.restore();
              fbCtx.save(); fbCtx.scale(-1, 1); fbCtx.drawImage(img, img.width - 40, 0, 40, img.height, -fbCanvas.width, sy, sx, img.height); fbCtx.restore();
            }
            fbCtx.globalAlpha = 1.0;
            fbCtx.drawImage(img, sx, sy, img.width, img.height);
            resolve({ imgData: fbCanvas.toDataURL('image/jpeg', 0.95), type: 'fallback' });
          }
        };
        img.src = task.sourceImage;
      });

      processImage.then(res => {
        clearInterval(progressTimer);
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 100 } : t));
        setTimeout(() => {
          setTasks(prev => prev.filter(t => t.id !== task.id));
          setHistory(prev => [{ 
            ...task, status: 'completed', outputImage: res.imgData, completedAt: new Date(), isFallback: res.type === 'fallback' 
          }, ...prev]);
        }, 500);
      });
    };

    const pendingTask = tasks.find(t => t.status === 'pending');
    if (pendingTask) {
      processTask(pendingTask);
    }
  }, [tasks]);

  const handleBatchDownload = () => {
    history.forEach((item, index) => {
      const link = document.createElement('a');
      link.href = item.outputImage; link.download = `AI_Studio_Gen_${item.id}.jpg`;
      setTimeout(() => link.click(), index * 300); 
    });
  };

  // --- [UI 렌더링 파트] ---
  const renderSidebar = () => (
    <div className={`w-full lg:w-80 bg-slate-900 lg:border-l border-slate-700 flex flex-col h-full ${mobileMenuOpen === 'history' ? 'block' : 'hidden lg:flex'}`}>
      <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800">
        <h3 className="font-semibold text-slate-100 flex items-center gap-2">
          <History size={18} /> 작업 히스토리
        </h3>
        {history.length > 0 && (
          <button onClick={handleBatchDownload} className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-md flex items-center gap-1 shadow-md">
            <Download size={14} /> 일괄 저장
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {tasks.map(task => (
          <div key={task.id} className="bg-slate-800 rounded-lg p-4 border border-indigo-500/50 shadow-lg">
            <div className="flex justify-between items-end mb-2">
              <div className="flex items-center gap-2">
                <Loader2 className="animate-spin text-indigo-400" size={16} />
                <span className="text-sm font-semibold text-slate-200">AI 모델 호출 중...</span>
              </div>
              <span className="text-xl font-bold text-indigo-400">{task.progress}%</span>
            </div>
            <div className="w-full bg-slate-900 rounded-full h-2 mb-3 border border-slate-700 overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full transition-all duration-300 ease-out" style={{ width: `${task.progress}%` }}></div>
            </div>
            <div className="text-xs text-slate-400 grid grid-cols-2 gap-1">
              <p>목표 비율: <span className="text-slate-300">{task.params.targetRatio}</span></p>
              <p>확장 방향: <span className="text-slate-300">{EXTEND_DIRECTIONS.find(d=>d.value===task.params.extendDirection)?.label}</span></p>
            </div>
          </div>
        ))}
        {history.map(item => (
          <div key={item.id} className="bg-slate-800 rounded-lg p-3 border border-slate-700 group hover:border-indigo-500/50">
            <div className="relative aspect-square w-full rounded-md overflow-hidden bg-slate-950 mb-3 group-hover:ring-1 ring-indigo-500">
              <img src={item.outputImage} alt="Generated" className="w-full h-full object-contain" />
              <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <a href={item.outputImage} download={`AI_Gen_${item.id}.jpg`} className="bg-indigo-600 p-2.5 rounded-full text-white hover:scale-110 transition-transform">
                  <Download size={18} />
                </a>
              </div>
            </div>
            <div className="text-xs text-slate-400 space-y-1.5">
              <div className="flex justify-between items-center pb-1 border-b border-slate-700/50">
                <span className="text-slate-200 font-medium flex items-center gap-1">
                  <CheckCircle2 size={14} className="text-green-500" /> 완료됨
                </span>
                <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded text-slate-500">{item.completedAt.toLocaleTimeString()}</span>
              </div>
              <p className="pt-1 flex justify-between">
                <span>비율: {item.params.targetRatio} ({item.params.extendDirection})</span>
                {item.isFallback && <span className="text-orange-400 font-bold">API 실패(폴백)</span>}
              </p>
            </div>
          </div>
        ))}
        {tasks.length === 0 && history.length === 0 && (
          <div className="text-center text-slate-500 py-12 text-sm flex flex-col items-center gap-2">
            <History size={32} className="opacity-20" />
            <p>작업 내역이 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderControlPanel = () => (
    <div className={`w-full lg:w-96 bg-slate-900 flex flex-col h-full lg:border-r border-slate-700 ${mobileMenuOpen === 'controls' ? 'block' : 'hidden lg:flex'}`}>
      <div className="p-4 border-b border-slate-800 bg-slate-900 shrink-0">
        <h2 className="text-lg font-bold text-slate-100">제어 패널</h2>
        <p className="text-[10px] text-slate-400 mt-0.5">Gemini 모델 기반 생성 아웃페인팅 엔진</p>
      </div>

      <div className="flex border-b border-slate-800 bg-slate-900/80 overflow-x-auto no-scrollbar shrink-0">
        {[
          { id: 'size', icon: Crop, label: '구도/확장' },
          { id: 'upscale', icon: Maximize, label: '업스케일' },
          { id: 'subject', icon: User, label: '피사체' },
          { id: 'camera', icon: Camera, label: '카메라' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex-1 min-w-[80px] py-2.5 flex flex-col items-center gap-1 text-[11px] font-medium transition-colors ${activeTab === tab.id ? 'text-indigo-400 border-b-2 border-indigo-500 bg-slate-800/80' : 'text-slate-400 hover:bg-slate-800/30'}`}>
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4 lg:p-5 custom-scrollbar space-y-6">
        {activeTab === 'size' && (
          <div className="space-y-6 animate-fadeIn">
            {/* 🌟 출력 비율 (커스텀 입력 추가) 🌟 */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">출력 비율 (Aspect Ratio)</label>
              <div className="grid grid-cols-5 gap-1.5 mb-2">
                {ASPECT_RATIOS.map(ratio => (
                  <button key={ratio.value} onClick={() => updateParam('targetRatio', ratio.value)}
                    className={`py-2 text-[11px] lg:text-xs font-semibold rounded-md transition-all ${
                      params.targetRatio === ratio.value ? 'bg-indigo-600 text-white ring-1 ring-indigo-400' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {ratio.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center bg-slate-800 border border-slate-700 rounded-md px-3 py-1.5">
                <span className="text-xs text-slate-400 whitespace-nowrap">직접 입력:</span>
                <input 
                  type="text" 
                  value={params.targetRatio} 
                  onChange={(e) => updateParam('targetRatio', e.target.value)}
                  placeholder="예: 21:9"
                  className="bg-transparent border-none text-sm text-slate-200 outline-none w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-1">
                <Sparkles size={14} className="text-indigo-400"/> AI 생성 방향
              </label>
              <div className="grid grid-cols-3 gap-1.5 mb-1.5">
                {EXTEND_DIRECTIONS.slice(0, 3).map(dir => ( 
                  <button key={dir.value} onClick={() => updateParam('extendDirection', dir.value)}
                    className={`py-2.5 flex flex-col items-center gap-1 rounded-md ${
                      params.extendDirection === dir.value ? 'bg-indigo-600 text-white ring-1 ring-indigo-400' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <dir.icon size={16} /> <span className="text-[11px]">{dir.label}</span>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {EXTEND_DIRECTIONS.slice(3).map(dir => ( 
                  <button key={dir.value} onClick={() => updateParam('extendDirection', dir.value)}
                    className={`py-2 flex flex-col items-center gap-1 rounded-md ${
                      params.extendDirection === dir.value ? 'bg-indigo-600 text-white ring-1 ring-indigo-400' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <dir.icon size={14} /> <span className="text-[10px]">{dir.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-indigo-400 mb-1.5 flex justify-between">
                <span>자동 생성 프롬프트</span>
                <span className="bg-indigo-500/20 text-indigo-300 px-1.5 py-0.5 rounded text-[9px]">API 연동</span>
              </label>
              <textarea readOnly value={params.autoPrompt} className="w-full bg-slate-950 border border-slate-700 rounded-md p-2.5 text-[11px] text-slate-400 font-mono h-24 resize-none outline-none" />
            </div>
          </div>
        )}

        {activeTab === 'upscale' && (
          <div className="space-y-6 animate-fadeIn">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">업스케일 배율</label>
              <div className="grid grid-cols-3 gap-2">
                {UPSCALE_LEVELS.map(level => (
                  <button key={level.value} onClick={() => updateParam('upscaleLevel', level.value)} className={`py-2 text-sm rounded-md ${params.upscaleLevel === level.value ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400'}`}>
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 🌟 피사체 (참고 이미지 기반 프롬프트 생성 UI 추가) 🌟 */}
        {activeTab === 'subject' && (
          <div className="space-y-5 animate-fadeIn">
            {[
              { id: 'emotion', label: '표정 및 감정', placeholder: '예: 환하게 웃는 얼굴', options: PRESETS.emotion },
              { id: 'pose', label: '포즈 지정', placeholder: '예: 팔짱을 끼고 서있는 자세', options: PRESETS.pose },
              { id: 'hair', label: '헤어 스타일링', placeholder: '예: 숏컷 애쉬그레이' },
              { id: 'tryOn', label: '의상 지정', placeholder: '예: 검은색 베스트와 셔츠' },
            ].map(field => (
              <div key={field.id} className="bg-slate-900 p-3 rounded-lg border border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-2">{field.label}</label>
                
                <div className="flex gap-2">
                  <div className="flex-1">
                    <input 
                      type="text" 
                      value={params[field.id]} 
                      onChange={(e) => updateParam(field.id, e.target.value)} 
                      placeholder={field.placeholder} 
                      className="w-full bg-slate-800 border border-slate-700 rounded-md p-2.5 text-xs text-slate-200 outline-none focus:ring-1 focus:ring-indigo-500" 
                    />
                  </div>
                  {/* 파일 업로드 버튼 */}
                  <button 
                    onClick={() => fileInputRefs[field.id].current.click()}
                    disabled={analyzingStatus[field.id]}
                    className="shrink-0 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md w-10 flex items-center justify-center transition-colors relative"
                    title="참고 이미지 업로드하여 프롬프트 추출"
                  >
                    {analyzingStatus[field.id] ? (
                      <Loader2 size={16} className="text-indigo-400 animate-spin" />
                    ) : (
                      <ImagePlus size={16} className="text-slate-400" />
                    )}
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRefs[field.id]} 
                    onChange={(e) => handleReferenceImageUpload(field.id, e)} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                {/* 프리셋 버튼 렌더링 (옵션이 있는 경우만) */}
                {field.options && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {field.options.map(opt => (
                      <button 
                        key={opt} 
                        onClick={() => updateParam(field.id, opt)}
                        className={`px-2 py-1 text-[10px] rounded border transition-colors ${
                          params[field.id] === opt ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                    <button onClick={() => updateParam(field.id, '')} className="px-2 py-1 text-[10px] rounded border bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300">
                      지우기
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === 'camera' && (
          <div className="space-y-4 animate-fadeIn">
            <div>
              <label className="block text-[13px] font-medium text-slate-300 mb-1.5">카메라 앵글</label>
              <select value={params.cameraAngle} onChange={(e) => updateParam('cameraAngle', e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-md p-2.5 text-xs text-slate-200">
                {CAMERA_ANGLES.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-slate-300 mb-1.5">세부 배경/분위기 수동 프롬프트</label>
              <textarea value={params.detailPrompt} onChange={(e) => updateParam('detailPrompt', e.target.value)} placeholder="예: 배경을 밝은 스튜디오 조명으로 화려하게 묘사" className="w-full bg-slate-800 border border-slate-700 rounded-md p-3 text-xs text-slate-200 h-24 resize-none" />
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-black font-sans text-slate-200 overflow-hidden">
      <header className="h-14 sm:h-16 shrink-0 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-3 lg:px-6 w-full z-30 shadow-md">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className={`hidden sm:inline text-[10px] px-2 py-1 rounded border ${apiKey && apiKeyEnabled ? 'text-emerald-300 border-emerald-700 bg-emerald-950/50' : 'text-amber-300 border-amber-700 bg-amber-950/50'}`} title={bridgeMessage}>
            {bridgeMessage}
          </span>
          <div className="bg-indigo-600 p-1.5 sm:p-2 rounded-lg shadow-md">
            <Sparkles size={18} className="text-white" />
          </div>
          <div>
            <h1 className="font-bold text-sm lg:text-base tracking-wide text-white">AI Image Studio PRO</h1>
            <p className="text-[9px] sm:text-[10px] text-slate-400">Gemini Vision & Generation</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex lg:hidden bg-slate-800 rounded-md p-1 border border-slate-700">
            <button onClick={() => setMobileMenuOpen('controls')} className={`px-2 py-1 text-[10px] sm:text-[11px] rounded ${mobileMenuOpen === 'controls' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>설정</button>
            <button onClick={() => setMobileMenuOpen('main')} className={`px-2 py-1 text-[10px] sm:text-[11px] rounded ${mobileMenuOpen === 'main' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>뷰어</button>
            <button onClick={() => setMobileMenuOpen('history')} className={`px-2 py-1 text-[10px] sm:text-[11px] rounded ${mobileMenuOpen === 'history' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}>내역</button>
          </div>
          
          <button onClick={handleGenerate} disabled={!sourceImage || !apiKey || !apiKeyEnabled}
            className={`px-3 sm:px-6 py-1.5 sm:py-2 rounded-md font-bold text-xs sm:text-sm flex items-center gap-1 sm:gap-1.5 shadow-lg
              ${sourceImage && apiKey && apiKeyEnabled ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 text-white active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
          >
            <Play size={14} fill="currentColor" /> <span>AI 생성</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative w-full">
        {renderControlPanel()}

        <div className={`flex-1 flex flex-col relative h-full bg-slate-950 ${mobileMenuOpen === 'main' ? 'flex' : 'hidden lg:flex'}`}>
          <main className="flex-1 flex flex-col items-center justify-center p-4 lg:p-6 overflow-hidden relative w-full">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] sm:w-[500px] sm:h-[500px] bg-indigo-600/10 rounded-full blur-3xl pointer-events-none"></div>

            {!sourceImage ? (
              <label className="w-full max-w-lg aspect-video border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-900/40 hover:bg-slate-800/60 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all group shadow-xl">
                <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                <div className="bg-slate-800 p-3 sm:p-4 rounded-full group-hover:scale-110 shadow-lg">
                  <Upload size={28} className="text-slate-400 group-hover:text-indigo-400 transition-colors" />
                </div>
                <p className="mt-4 sm:mt-5 text-slate-200 font-semibold text-sm sm:text-base">클릭 또는 드래그하여 업로드</p>
              </label>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center relative">
                <div className="relative flex items-center justify-center max-w-full max-h-[85%] bg-slate-900/80 rounded-xl shadow-2xl border border-slate-800 p-2 lg:p-4">
                  <img src={sourceImage} alt="Source" className="max-w-full max-h-[60vh] lg:max-h-[70vh] object-contain rounded z-10" />
                  <button onClick={() => setSourceImage(null)} className="absolute top-2 right-2 sm:top-3 sm:right-3 bg-slate-900/90 hover:bg-red-500 text-slate-300 hover:text-white p-1.5 sm:p-2 rounded-full z-20 backdrop-blur-md shadow-lg">
                    <X size={14} />
                  </button>
                </div>

                <div className="absolute bottom-4 sm:bottom-6 flex bg-slate-900/90 backdrop-blur-md rounded-full border border-slate-700 shadow-2xl overflow-hidden text-[10px] sm:text-sm">
                  <div className="px-3 sm:px-5 py-2 flex items-center gap-1.5 border-r border-slate-700">
                    <span className="text-slate-500 hidden sm:inline">비율:</span>
                    <span className="font-bold text-indigo-400">{params.targetRatio}</span>
                  </div>
                  <div className="px-3 sm:px-5 py-2 flex items-center gap-1.5">
                    <span className="text-slate-500 hidden sm:inline">확장:</span>
                    <span className="font-bold text-indigo-400">{EXTEND_DIRECTIONS.find(d=>d.value===params.extendDirection)?.label}</span>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {renderSidebar()}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #334155; border-radius: 10px; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out forwards; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}} />
    </div>
  );
}
