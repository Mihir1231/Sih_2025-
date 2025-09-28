import React, { useState, useRef, useEffect, useCallback } from "react";

// --- SVG Icon Components ---
// Main wrapper for all icons
const Icon = ({ children, className = '' }: { children: React.ReactNode, className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    {children}
  </svg>
);

// Specific Icons
const MessageCircle = ({ className = '' }) => (<Icon className={className}><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" /></Icon>);
const X = ({ className = '' }) => (<Icon className={className}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>);
const Send = ({ className = '' }) => (<Icon className={className}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></Icon>);
const Mic = ({ className = '' }) => (<Icon className={className}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" x2="12" y1="19" y2="22" /></Icon>);
const MicOff = ({ className = '' }) => (<Icon className={className}><line x1="2" x2="22" y1="2" y2="22" /><path d="M18.5 10.5A4.5 4.5 0 0 0 12 6v-1a3 3 0 0 0-3 3v1" /><path d="M12 18.5a4.49 4.49 0 0 0 4.5-4.5v-2" /><line x1="12" x2="12" y1="19" y2="22" /><path d="M9.5 9.5A4.5 4.5 0 0 0 5 13v1" /></Icon>);
const Volume2 = ({ className = '' }) => (<Icon className={className}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /></Icon>);
const UserIcon = ({ className = '' }) => (<Icon className={className}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></Icon>);
const InfoIcon = ({ className = '' }) => (<Icon className={className}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></Icon>);
const RefreshCw = ({ className = '' }) => (<Icon className={className}><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></Icon>);
const Minus = ({ className = '' }) => (<Icon className={className}><line x1="5" y1="12" x2="19" y2="12"></line></Icon>);
const ArrowUpLeft = ({ className = '' }) => (<Icon className={className}><line x1="17" y1="17" x2="7" y2="7"></line><polyline points="7 17 7 7 17 7"></polyline></Icon>);

// --- IMPORTANT LOGO UPDATE ---
// You cannot use a local file path like "D:\..." directly in web development for security reasons.
// To use your logo, please follow one of these two methods:
//
// METHOD 1 (Recommended): The 'public' folder
// 1. In your project, find or create a 'public' folder at the root level.
// 2. Copy your "samvaad logo.jpg" into this 'public' folder.
// 3. Change the 'src' attribute below to just "/samvaad logo.jpg".
//
// METHOD 2: Importing from 'src'
// 1. Place your logo image inside your 'src' folder (e.g., 'src/assets/samvaad_logo.jpg').
// 2. At the top of this file, add this import statement: import ldrpLogoImage from './assets/samvaad_logo.jpg';
// 3. Change the 'src' attribute below to: src={ldrpLogoImage}
//
// The URL below is a placeholder to show you where the logo will appear.
const LdrpLogo = ({ className = '' }) => (
    <img
        src="https://i.pinimg.com/736x/b3/dd/92/b3dd925bd0a74b1ba68e911e79025a43.jpg" // <-- REPLACE THIS with your logo path (see instructions above)
        alt="LDRP Logo"
        className={`rounded-full ${className}`}
    />
);


// --- Custom Styles and Animations ---
const ChatbotStyles = () => (
    <style>{`
        @keyframes fade-in-up { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animation-fade-in-up { animation: fade-in-up 0.5s ease-out forwards; }
        @keyframes gemini-pulse { 0%, 100% { transform: scaleY(0.4); opacity: 0.5; } 50% { transform: scaleY(1); opacity: 1; } }
        .gemini-bar { animation: gemini-pulse 1.2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
    `}</style>
);

// --- Types ---
interface Option { text: string; payload: string; }
interface Message { id: string; text: string; isUser: boolean; timestamp: Date; type?: 'system' | 'correction'; options?: Option[]; }

// --- Language and Content Configuration ---
const supportedLanguages: { [key:string]: string } = {
    'en-IN': 'English', 'hi-IN': 'हिन्दी', 'gu-IN': 'ગુજરાતી', 'bn-IN': 'বাংলা', 'mr-IN': 'मराठी', 'ta-IN': 'தமிழ்', 'te-IN': 'తెలుగు', 'kn-IN': 'ಕನ್ನಡ', 'ml-IN': 'മലയാളം', 'pa-IN': 'ਪੰਜਾਬੀ', 'ur-IN': 'اردو'
};
const visitorQuestions: Option[] = [
    { text: "College Timings", payload: "visitor_q1" }, { text: "Admission Documents", payload: "visitor_q2" }, { text: "Fee Structure", payload: "visitor_q3" }, { text: "Anti-Ragging Policies", payload: "visitor_q4" }, { text: "Ask Other Query", payload: "ask_other_query" },
];
const predefinedVisitorAnswers: { [key: string]: string } = {
    visitor_q1: "The college operates from 9:00 AM to 5:00 PM, Monday to Saturday.", visitor_q2: "For admission, you'll need your 10th and 12th mark sheets, school leaving certificate, and passport-sized photographs.", visitor_q3: "The detailed fee structure for each course is available on our website's admission page. Please visit ldrp.ac.in/admissions.", visitor_q4: "Yes, LDRP has a zero-tolerance policy towards ragging. A dedicated anti-ragging committee is in place to handle any incidents.", visitor_q5: "We have a dedicated placement cell that works with top companies. Our placement record has been consistently excellent. More details are on our website.",
};

// --- Gemini Loading Indicator ---
const GeminiLoadingIndicator = () => (
    <div className="flex items-center space-x-2">
        <div className="w-1.5 h-6 bg-blue-700 rounded-full gemini-bar" style={{ animationDelay: '0.1s' }}></div>
        <div className="w-1.5 h-6 bg-blue-600 rounded-full gemini-bar" style={{ animationDelay: '0.2s' }}></div>
        <div className="w-1.5 h-6 bg-blue-500 rounded-full gemini-bar" style={{ animationDelay: '0.3s' }}></div>
        <p className="text-sm font-medium text-gray-500">Samvaad is thinking...</p>
    </div>
);

// --- Typo Correction Algorithm (Levenshtein Distance) ---
const typoDictionary = ['admission', 'document', 'fee', 'structure', 'ragging', 'policy', 'placement', 'timing', 'college', 'semester', 'exam', 'timetable', 'notice', 'circular', 'event', 'information'];
const levenshteinDistance = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));
    for (let i = 0; i <= a.length; i++) { matrix[0][i] = i; }
    for (let j = 0; j <= b.length; j++) { matrix[j][0] = j; }
    for (let j = 1; j <= b.length; j++) {
        for (let i = 1; i <= a.length; i++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[j][i] = Math.min(matrix[j][i - 1] + 1, matrix[j - 1][i] + 1, matrix[j - 1][i - 1] + cost);
        }
    }
    return matrix[b.length][a.length];
};
const correctTypos = (text: string): string => {
    return text.split(' ').map(word => {
        if (word.length < 4) return word; 
        let bestMatch = word;
        let minDistance = 2; 
        for (const dictWord of typoDictionary) {
            const distance = levenshteinDistance(word.toLowerCase(), dictWord);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = dictWord;
            }
        }
        return bestMatch;
    }).join(' ');
};

const ChatBot = () => {
    const initialMessages: Message[] = [
        { id: "1", text: "Welcome to LDRP! I'm here to assist you. To get started, please select your role.", isUser: false, timestamp: new Date(), options: [ { text: "I am a Student", payload: "role_student" }, { text: "I am a Parent / Visitor", payload: "role_parent_visitor" }] }
    ];

    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [inputMessage, setInputMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isInputDisabled, setIsInputDisabled] = useState(true);
    const [studentMode, setStudentMode] = useState(false);
    const [isAgentMode, setIsAgentMode] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isVoiceSupported, setIsVoiceSupported] = useState(false);
    const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
    const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
    const [isMinimized, setIsMinimized] = useState(false);

    const [batch, setBatch] = useState("ALL");
    const [branch, setBranch] = useState("Computer Engineering");
    const [semester, setSemester] = useState("ALL");
    const [docType, setDocType] = useState("ALL");

    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const recognitionRef = useRef<any>(null);

    useEffect(() => {
        if (!isMinimized) {
            scrollAreaRef.current?.scrollTo({ top: scrollAreaRef.current.scrollHeight, behavior: "smooth" });
        }
    }, [messages, isMinimized]);

    useEffect(() => {
        const initSpeech = () => {
            if ('speechSynthesis' in window) {
                const updateVoices = () => setAvailableVoices(window.speechSynthesis.getVoices());
                window.speechSynthesis.onvoiceschanged = updateVoices;
                updateVoices();
            }
            if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
                const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                recognitionRef.current = new SpeechRecognition();
                recognitionRef.current.continuous = false;
                recognitionRef.current.interimResults = true;
                recognitionRef.current.onresult = (event: any) => {
                    let finalTranscript = '';
                    for (let i = 0; i < event.results.length; ++i) {
                        if (event.results[i].isFinal) {
                            finalTranscript += event.results[i][0].transcript;
                        }
                    }
                    if (finalTranscript) {
                        setInputMessage(finalTranscript);
                        setIsListening(false);
                    }
                };
                recognitionRef.current.onerror = (event: any) => { console.error("Speech recognition error:", event.error); setIsListening(false); };
                recognitionRef.current.onend = () => setIsListening(false);
                setIsVoiceSupported(true);
            }
        };
        initSpeech();
    }, []);

    const speakText = useCallback((text: string, lang: string) => {
        if (!('speechSynthesis' in window) || !text) return;
        window.speechSynthesis.cancel();
        const voice = availableVoices.find(v => v.lang.startsWith(lang.split('-')[0]));
        if (voice) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = lang;
            utterance.voice = voice;
            window.speechSynthesis.speak(utterance);
        } else {
            const tempMsgId = Date.now().toString();
            const langName = supportedLanguages[lang] || 'the selected language';
            const tempMessage: Message = { id: tempMsgId, text: `A voice for ${langName} is not available on your device.`, isUser: false, timestamp: new Date(), type: 'system' };
            setMessages(prev => [...prev, tempMessage]);
            setTimeout(() => setMessages(prev => prev.filter(m => m.id !== tempMsgId)), 5000);
        }
    }, [availableVoices]);

    const startListening = () => {
        if (recognitionRef.current && !isListening) {
            recognitionRef.current.lang = selectedLanguage;
            setIsListening(true);
            recognitionRef.current.start();
        }
    };
    
    const stopListening = () => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
            setIsListening(false);
        }
    };
    
    const handleRefresh = () => {
        setMessages(initialMessages);
        setIsInputDisabled(true);
        setStudentMode(false);
        setIsAgentMode(false);
        setIsMinimized(false);
    };

    const resetToVisitorStart = () => {
        const botResponse: Message = { id: (Date.now() + 1).toString(), text: "You can select another question or ask a different query.", isUser: false, timestamp: new Date(), options: [...visitorQuestions, { text: "End Chat", payload: "end_chat" }] };
        setMessages(prev => [...prev, botResponse]);
    };

    const handleOptionClick = (option: Option) => {
        const userMessage: Message = { id: Date.now().toString(), text: option.text, isUser: true, timestamp: new Date() };
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setIsInputDisabled(true);
        setIsAgentMode(false);

        setTimeout(() => {
            let botResponse: Message;
            if (option.payload === "role_parent_visitor") {
                botResponse = { id: (Date.now() + 1).toString(), text: "Welcome! Please select a question below, or ask your own.", isUser: false, timestamp: new Date(), options: visitorQuestions };
                setStudentMode(false);
            } else if (option.payload === "role_student") {
                botResponse = { id: (Date.now() + 1).toString(), text: "Great! Please select your details below, then type your question.", isUser: false, timestamp: new Date() };
                setStudentMode(true);
                setIsInputDisabled(false);
            } else if (predefinedVisitorAnswers[option.payload]) {
                const answerText = predefinedVisitorAnswers[option.payload];
                botResponse = { id: (Date.now() + 1).toString(), text: answerText, isUser: false, timestamp: new Date() };
                setTimeout(() => resetToVisitorStart(), 1000);
            } else if (option.payload === "ask_other_query") {
                botResponse = { id: (Date.now() + 1).toString(), text: "The agent is now active. Please type your question below.", isUser: false, timestamp: new Date() };
                setIsAgentMode(true);
                setIsInputDisabled(false);
            } else if (option.payload === "end_chat" || option.payload === "end_chat_student") {
                botResponse = { id: (Date.now() + 1).toString(), text: "Thank you for visiting. Have a great day!", isUser: false, timestamp: new Date() };
                setIsInputDisabled(true);
                setStudentMode(false);
            }
            setMessages(prev => [...prev, botResponse]);
            setIsLoading(false);
        }, 800);
    };

    const handleSendMessage = async (messageToSend?: string) => {
        const originalMessage = (messageToSend || inputMessage).trim();
        if (!originalMessage) return;

        const correctedMessage = correctTypos(originalMessage);
        const userMessage: Message = { id: Date.now().toString(), text: originalMessage, isUser: true, timestamp: new Date() };
        let messagesWithCorrection: Message[] = [userMessage];
        
        if (originalMessage.toLowerCase() !== correctedMessage.toLowerCase()) {
            const correctionNotice: Message = { id: (Date.now() + 0.5).toString(), text: `Did you mean: "${correctedMessage}"?`, isUser: false, timestamp: new Date(), type: 'correction' };
            messagesWithCorrection.push(correctionNotice);
        }

        setMessages(prev => [...prev, ...messagesWithCorrection]);
        setInputMessage("");
        setIsLoading(true);
        setIsInputDisabled(true);

        try {
            let endpoint = "";
            let payload: object = {};
            if (studentMode) {
                endpoint = "http://localhost:8000/student_query";
                payload = { batch, branch, semester, doc_type: docType, question: correctedMessage, target_language: selectedLanguage };
            } else if (isAgentMode) {
                endpoint = "http://localhost:8000/rag_query";
                payload = { question: correctedMessage, target_language: selectedLanguage };
            }

            if (endpoint) {
                const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
                if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
                const data = await res.json();
                const answerText = data.answer || "Sorry, I couldn't find an answer.";
                
                const botMessage: Message = { id: (Date.now() + 1).toString(), text: answerText, isUser: false, timestamp: new Date() };
                setMessages(prev => [...prev, botMessage]);
                
                if (isAgentMode) {
                    setTimeout(() => { setIsInputDisabled(true); resetToVisitorStart(); }, 1000);
                }
            }
        } catch (err) {
            console.error("API call failed:", err);
            const errorText = "Sorry, I'm having trouble connecting to the server.";
            const errorMessage: Message = { id: (Date.now() + 1).toString(), text: `⚠ ${errorText}`, isUser: false, timestamp: new Date() };
            setMessages(prev => [...prev, errorMessage]);
        }
        setIsLoading(false);
        if (studentMode) setIsInputDisabled(false);
    };

    if (!isOpen) {
        return (
          <div className="fixed bottom-6 right-6 z-50">
            <button onClick={() => setIsOpen(true)} className="h-20 w-20 rounded-full bg-blue-800 shadow-lg hover:shadow-xl hover:shadow-blue-800/30 transition-all duration-300 hover:scale-110 flex items-center justify-center" aria-label="Open Chat">
              <MessageCircle className="h-10 w-10 text-white" />
            </button>
          </div>
        );
    }
    
    const containerClasses = `fixed bottom-6 right-6 z-50 w-[26rem] max-w-[90vw] transition-all duration-300 ease-in-out font-sans ${isMinimized ? 'h-16' : 'h-[40rem] max-h-[85vh]'}`;

    return (
        <div className={containerClasses}>
            <ChatbotStyles />
            <div className="w-full h-full bg-white rounded-xl shadow-2xl shadow-blue-800/20 border border-gray-200 flex flex-col overflow-hidden">
                <header className="flex items-center justify-between p-3 bg-blue-800 text-white rounded-t-xl flex-shrink-0">
                    <div className="flex items-center space-x-3">
                        <LdrpLogo className="w-9 h-9" />
                        <h3 className="font-bold text-md text-xl">Samvaad</h3>
                    </div>
                    <div className="flex items-center space-x-1">
                        <button onClick={(e) => { e.stopPropagation(); setIsMinimized(!isMinimized); }} className="p-2 rounded-full hover:bg-white/20" title={isMinimized ? "Maximize" : "Minimize"}>
                            {isMinimized ? <ArrowUpLeft className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleRefresh(); }} className="p-2 rounded-full hover:bg-white/20" title="Refresh Chat"><RefreshCw className="h-4 w-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setIsOpen(false); }} className="p-2 rounded-full hover:bg-white/20" title="Close"><X className="h-4 w-4" /></button>
                    </div>
                </header>

                {!isMinimized && (
                    <>
                        <div className="flex-1 p-4 overflow-y-auto bg-white" ref={scrollAreaRef}>
                            <div className="space-y-6">
                                {messages.map(msg => {
                                    if (msg.type === 'system' || msg.type === 'correction') {
                                        return (
                                            <div key={msg.id} className="flex items-center justify-center text-xs text-gray-500 animation-fade-in-up">
                                                <div className="flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1">
                                                    <InfoIcon className="w-4 h-4" />
                                                    <span>{msg.text}</span>
                                                </div>
                                            </div>
                                        )
                                    }
                                    return (
                                        <div key={msg.id}>
                                            <div className={`flex items-end gap-2 animation-fade-in-up ${msg.isUser ? "justify-end" : "justify-start"}`}>
                                                <div className={`max-w-[85%] p-3 rounded-2xl text-sm relative group ${msg.isUser ? "bg-blue-800 text-white rounded-br-none" : "bg-gray-100 text-gray-800 rounded-bl-none"}`}>
                                                    <p className="whitespace-pre-wrap">{msg.text}</p>
                                                    {!msg.isUser && isVoiceSupported && (<button onClick={() => speakText(msg.text, selectedLanguage)} className="absolute -right-9 top-1/2 -translate-y-1/2 p-1 rounded-full text-gray-400 hover:bg-gray-200 opacity-0 group-hover:opacity-100 transition-opacity" title="Read aloud"><Volume2 className="h-4 w-4" /></button>)}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                                
                                {messages[messages.length - 1]?.options && !isLoading && (
                                    <div className="flex flex-wrap gap-2 mt-4 justify-start animation-fade-in-up">{messages[messages.length - 1].options!.map(option => (<button key={option.payload} className="text-sm bg-white border border-blue-700 text-blue-800 hover:bg-blue-100 rounded-full px-4 py-1.5 transition-colors" onClick={() => handleOptionClick(option)}>{option.text}</button>))}</div>
                                )}

                                {studentMode && !isInputDisabled && (
                                    <div className="mt-4 space-y-3 bg-gray-50 p-4 rounded-lg border animation-fade-in-up">
                                        <h4 className="font-semibold text-sm text-gray-800 mb-3">Please provide your details:</h4>
                                        {[
                                            {label: "Batch", value: batch, setter: setBatch, options: ["ALL", "2022-2026", "2023-2027", "2024-2028", "2025-2029"]}, 
                                            {label: "Branch", value: branch, setter: setBranch, options: ["Computer Engineering", "Information Technology", "Mechanical Engineering", "Electrical & Communication", "Electrical Engineering"]}, 
                                            {label: "Semester", value: semester, setter: setSemester, options: [{label: "ALL Semesters", value: "ALL"}, ...Array.from({length: 8}, (_, i) => ({label: `Semester ${i + 1}`, value: `Semester ${i + 1}`}))]}, 
                                            {label: "Document Type", value: docType, setter: setDocType, options: ["ALL", "ExamForm", "FeesNotice", "ExamTimetable", "Circular", "EventInformation", "ClassTimeTable", "SeminarInformation", "GeneralNotice", "GeneralInformation"]}
                                        ].map(item => (
                                            <select key={item.label} value={item.value} onChange={e => item.setter(e.target.value)} className="w-full p-2 border border-gray-300 rounded-md bg-white text-sm focus:ring-2 focus:ring-blue-700">{item.options.map(opt => typeof opt === 'string' ? <option key={opt} value={opt}>{opt}</option> : <option key={opt.value} value={opt.value}>{opt.label}</option>)}</select>
                                        ))}
                                        <button
                                            onClick={() => handleOptionClick({ text: "End Chat", payload: "end_chat_student" })}
                                            className="w-full mt-2 text-sm bg-gray-200 text-gray-700 hover:bg-gray-300 rounded-full px-4 py-2 transition-colors"
                                        >
                                            End Chat
                                        </button>
                                    </div>
                                )}

                                {isLoading && (<div className="flex justify-start animation-fade-in-up"><div className="flex items-end gap-2"><div className="bg-gray-100 p-3 rounded-2xl rounded-bl-none"><GeminiLoadingIndicator /></div></div></div>)}
                            </div>
                        </div>
                        
                        <div className="p-3 border-t bg-white flex-shrink-0">
                            <div className="flex items-center gap-2">
                                {isVoiceSupported && (
                                    <div className="relative">
                                        <select 
                                            value={selectedLanguage} 
                                            onChange={e => setSelectedLanguage(e.target.value)} 
                                            className="bg-gray-100 text-gray-700 text-sm font-semibold rounded-lg py-3 pl-3 pr-8 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-700 cursor-pointer"
                                            aria-label="Select language"
                                        >
                                            {Object.entries(supportedLanguages).map(([code, name]) => (
                                                <option key={code} value={code} className="font-sans">{name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute inset-y-0 right-2 flex items-center pointer-events-none">
                                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                        </div>
                                    </div>
                                )}
                                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }} className="flex-1 relative flex items-center">
                                   <input 
                                        value={inputMessage} 
                                        onChange={e => setInputMessage(e.target.value)} 
                                        placeholder={isInputDisabled ? "Please select an option..." : "Type your message here..."} 
                                        disabled={isInputDisabled || isLoading} 
                                        className="w-full text-sm p-3 pl-12 pr-12 bg-gray-100 border border-transparent rounded-lg focus:ring-2 focus:ring-blue-700 focus:outline-none disabled:bg-gray-200"
                                   />
                                   <button 
                                        type="button" 
                                        onClick={isListening ? stopListening : startListening} 
                                        disabled={isInputDisabled || isLoading}
                                        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-blue-800 disabled:text-gray-300" 
                                        title="Voice input"
                                   >
                                        <Mic className={`h-5 w-5 ${isListening ? 'text-red-500 animate-pulse' : ''}`} />
                                   </button>
                                   <button 
                                        type="submit" 
                                        disabled={isInputDisabled || isLoading || !inputMessage.trim()} 
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-800 hover:text-blue-900 disabled:text-gray-300"
                                        title="Send message"
                                   >
                                        <Send className="h-5 w-5" />
                                   </button>
                                </form>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default ChatBot;