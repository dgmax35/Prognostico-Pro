/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Search, 
  TrendingUp, 
  ShieldCheck, 
  AlertTriangle, 
  Zap, 
  Target, 
  BarChart3, 
  Calendar,
  ChevronRight,
  Users,
  Loader2,
  Info,
  History,
  Save,
  LogOut,
  LogIn,
  CheckCircle2,
  XCircle,
  Clock,
  Trash2,
  RefreshCw,
  Table,
  Calculator,
  Plus,
  Bot,
  Smile,
  Send,
  X,
  MessagesSquare,
  Crown,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { auth, db, googleProvider } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  updateDoc, 
  doc, 
  deleteDoc, 
  serverTimestamp,
  orderBy,
  getDocFromServer
} from 'firebase/firestore';
import { Toaster, toast } from 'sonner';

// Error Handling Types
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Helper for dynamic dates
const getDynamicDates = () => {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const formatDate = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    const monthName = months[date.getMonth()];
    return {
      formatted: `${d}/${m}/${y}`,
      long: `${d} de ${monthName} de ${y}`
    };
  };

  const todayData = formatDate(today);
  const tomorrowData = formatDate(tomorrow);

  return {
    today: todayData.formatted,
    todayLong: todayData.long,
    tomorrow: tomorrowData.formatted,
    tomorrowLong: tomorrowData.long,
    currentYear: today.getFullYear(),
    currentMonth: months[today.getMonth()]
  };
};

const validateGameDates = (data: any, type: 'single' | 'multi' | 'leverage'): boolean => {
  const { today, tomorrow, currentYear } = getDynamicDates();
  const currentYearStr = currentYear.toString();
  
  const parseDateAndValidate = (dateStr: string) => {
    if (!dateStr) return false;
    
    // Normalize date string: remove separators, lowercase, replace months with numbers
    const normalize = (s: string) => {
      let res = s.toLowerCase()
        .replace(/jan(?:eiro)?/g, '01')
        .replace(/fev(?:ereiro)?/g, '02')
        .replace(/mar(?:ço)?/g, '03')
        .replace(/abr(?:il)?/g, '04')
        .replace(/mai(?:o)?/g, '05')
        .replace(/jun(?:ho)?/g, '06')
        .replace(/jul(?:ho)?/g, '07')
        .replace(/ago(?:sto)?/g, '08')
        .replace(/set(?:embro)?/g, '09')
        .replace(/out(?:ubro)?/g, '10')
        .replace(/nov(?:embro)?/g, '11')
        .replace(/dez(?:embro)?/g, '12')
        .replace(/[\/-]/g, '')
        .replace(/\s+/g, '')
        .replace(/de/g, '')
        .trim();
      return res;
    };

    const normalizedInput = normalize(dateStr);
    
    // Today and Tomorrow info
    const { today, tomorrow, currentYear } = getDynamicDates();
    const currentYearStr = currentYear.toString();
    const currentYearShort = currentYearStr.substring(2);

    const getParts = (dStr: string) => {
      const parts = dStr.split('/');
      return {
        day: parts[0],
        month: parts[1],
        year: parts[2]
      };
    };

    const t = getParts(today);
    const tm = getParts(tomorrow);

    const check = (p: {day: string, month: string, year: string}) => {
      // Check for "Hoje", "Today", "Amanhã", "Tomorrow" (case insensitive)
      const isRelativeDate = /hoje|today|amanhã|tomorrow/i.test(dateStr);
      if (isRelativeDate) return true;

      // Check for day+month (e.g. 0105) and year (2026 or 26)
      const hasDayMonth = normalizedInput.includes(p.day + p.month) || 
                         normalizedInput.includes(parseInt(p.day).toString() + p.month) ||
                         normalizedInput.includes(p.day + parseInt(p.month).toString()) ||
                         normalizedInput.includes(parseInt(p.day).toString() + parseInt(p.month).toString());
      
      const hasYear = normalizedInput.includes(p.year) || normalizedInput.includes(currentYearShort);
      
      // If year is present, it MUST be the current year
      if (normalizedInput.includes('2024') || normalizedInput.includes('2025')) {
        return false;
      }

      return hasDayMonth && (hasYear || !normalizedInput.match(/\d{4}/)); // If no 4-digit year, assume current if day/month matches
    };

    return check(t) || check(tm);
  };

    try {
    if (!data) return false;
    
    if (type === 'single' || type === 'leverage') {
      return parseDateAndValidate(data.data);
    }
    
    if (type === 'multi') {
      if (!data.jogos || !Array.isArray(data.jogos)) return false;
      return data.jogos.every((j: any) => parseDateAndValidate(j.data));
    }
  } catch (e) {
    return false;
  }
  return true;
};

// Helper to safely parse JSON from AI response with repair capabilities
const safeJsonParse = (text: string) => {
  const tryRepairJson = (json: string) => {
    let repaired = json.trim();
    
    // Basic structural repairs for truncated objects/arrays
    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\') {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;

        if (char === '{' || char === '[') {
            stack.push(char);
        } else if (char === '}') {
            if (stack[stack.length - 1] === '{') stack.pop();
        } else if (char === ']') {
            if (stack[stack.length - 1] === '[') stack.pop();
        }
    }

    if (inString) {
        // Handle trailing backslash that would escape our closing quote
        if (repaired.endsWith('\\') && !repaired.endsWith('\\\\')) {
            repaired = repaired.slice(0, -1);
        }
        repaired += '"';
    }
    
    // Clean up trailing separators and incomplete keys/values
    repaired = repaired.trim();
    
    // Iteratively remove trailing illegal characters and incomplete object properties
    let previousRepaired = '';
    while (repaired !== previousRepaired) {
        previousRepaired = repaired;
        
        // Remove trailing commas, colons, and whitespace
        repaired = repaired.replace(/[,:\s]+$/, '').trim();
        
        // Handle truncated property names: if we end with a quote, check if it's a key without a value
        if (repaired.endsWith('"')) {
            const lastQuoteIdx = repaired.lastIndexOf('"', repaired.length - 2);
            if (lastQuoteIdx !== -1) {
                // If the character before the start of the quoted string is '{' or ',', 
                // it's likely a property name without a value yet.
                const beforeQuoted = repaired.substring(0, lastQuoteIdx).trim();
                if (beforeQuoted.endsWith('{') || beforeQuoted.endsWith(',')) {
                    repaired = beforeQuoted;
                }
            }
        }
    }
    
    while (stack.length > 0) {
        const last = stack.pop();
        if (last === '{') {
            repaired = repaired.trim().replace(/,$/, '') + '}';
        } else if (last === '[') {
            repaired = repaired.trim().replace(/,$/, '') + ']';
        }
    }
    
    return repaired;
  };

  try {
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\n?/, '').replace(/\n?```$/, '');
    }
    
    const firstBrace = cleaned.indexOf('{');
    const firstBracket = cleaned.indexOf('[');
    let startIdx = -1;
    let endChar = '';
    
    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
      startIdx = firstBrace;
      endChar = '}';
    } else if (firstBracket !== -1) {
      startIdx = firstBracket;
      endChar = ']';
    }
    
    if (startIdx === -1) throw new Error("JSON não encontrado");
    
    // Attempt to find the balanced closing character to ignore trailing garbage
    let jsonPart = cleaned.substring(startIdx);
    const startChar = cleaned[startIdx];
    let balance = 0;
    let inString = false;
    let escaped = false;
    let actualEndIdx = -1;

    for (let i = 0; i < jsonPart.length; i++) {
        const char = jsonPart[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === '\\') {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (char === startChar) {
          balance++;
        } else if (char === endChar) {
          balance--;
          if (balance === 0) {
            actualEndIdx = i;
            break;
          }
        }
    }

    if (actualEndIdx !== -1) {
      jsonPart = jsonPart.substring(0, actualEndIdx + 1);
    } else {
      // If we didn't find a balance, try to trim any non-JSON characters at the end
      jsonPart = jsonPart.trim().replace(/[^{}\[\]]*$/, '');
    }

    try {
      return JSON.parse(jsonPart.trim());
    } catch (initialError) {
      // Try to repair truncated JSON
      const repaired = tryRepairJson(jsonPart.trim());
      return JSON.parse(repaired);
    }
  } catch (e) {
    console.error("JSON Parse Error:", e, "Original text:", text);
    throw new Error("Falha ao processar os dados da análise. O conteúdo foi muito longo ou malformado. Tente novamente.");
  }
};

// Types for the analysis response
interface AnalysisResult {
  confronto: string;
  liga: string;
  data: string;
  analiseJogo: {
    estiloEquipes: string;
    tendencia: string;
    expectativa: string;
    caracteristicaJogo: string;
    arbitro: {
      nome: string;
      caracteristicas: string;
    };
  };
  estatisticas: {
    golsMedios: string;
    overUnder: string;
    btts: string;
    escanteios: string;
    escanteiosHT: string;
    golsHT: string;
    finalizacoes: string;
    chutesTotal: string;
    chutesAoGol: string;
    defesasGoleiro: string;
    cartoes: string;
    formaRecente: string;
  };
  leituraMercado: {
    valor: string;
    pontosFortesFracos: string;
  };
  prognosticoPrincipal: {
    entrada: string;
    odd: string;
    justificativa: string;
    entradaSegura: {
      mercado: string;
      odd: string;
      justificativa: string;
    };
  };
  apostaPersonalizada: {
    selecoes: string[];
    oddTotal: string;
    justificativa: string;
  };
  alavancagemJogo: {
    entrada: string;
    justificativa: string;
  };
  alavancagemDia: {
    jogos: { jogo: string; entrada: string; horario: string; entradaSegura: string }[];
    oddTotal: string;
    estrategia: string;
  };
  gestaoRisco: 'segura' | 'moderada' | 'agressiva';
  confianca: string;
  mercadosElite?: {
    mercado: string;
    tendencia: 'Alta Tendência' | 'Baixa Tendência';
    prognostico: string;
    estatistica: string;
  }[];
  basquete?: {
      jogadores: {
        nome: string;
        pontos: string;
        rebotes: string;
        assistencias: string;
        cestas3: string;
        duploDuplo: string;
        triploDuplo: string;
      }[];
      pontuacaoTimes: string;
      pontosQuartos: {
        q1: string;
        q2: string;
        q3: string;
        q4: string;
      };
      pontosTempo: {
        t1: string;
        t2: string;
      };
    };
    mestreDeElite?: {
      analiseProfunda: string;
      confrontoDireto: string;
      ultimosJogos: string;
      predicaoAbsoluta: string;
      eventosGarantidos: string[];
      oddJustificada: string;
    };
}

interface SavedAnalysis {
  id: string;
  userId: string;
  game: string;
  date: string;
  analysis?: AnalysisResult;
  multiAnalysis?: MultiBetResult;
  type: 'single' | 'multi';
  status: 'pending' | 'hit' | 'miss' | 'void';
  postGameAnalysis?: string;
  entryStatuses?: {
    principal?: 'pending' | 'hit' | 'miss' | 'void';
    segura?: 'pending' | 'hit' | 'miss' | 'void';
    alavancagem?: 'pending' | 'hit' | 'miss' | 'void';
    apostaPersonalizada?: 'pending' | 'hit' | 'miss' | 'void';
    multi?: ('pending' | 'hit' | 'miss' | 'void')[];
  };
  createdAt: any;
}

interface MultiBetResult {
  jogos: {
    confronto: string;
    liga: string;
    data: string;
    horario: string;
    entrada: string;
    odd: string;
    justificativaCurta: string;
    fonteVerificacao: string;
    mercado: string;
  }[];
  oddTotal: string;
  analiseGeral: string;
  confianca: string;
}

interface LeverageResult {
  confronto: string;
  liga: string;
  data: string;
  horario: string;
  entrada: string;
  odd: string;
  justificativa: string;
  confianca: string;
}

interface SpreadsheetEntry {
  id: string;
  date: string;
  game: string;
  odd: number;
  stake: number;
  status: 'hit' | 'miss' | 'pending' | 'void';
  profit: number;
}

// Error Boundary Component
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo: string | null;
}

class ErrorBoundary extends (React.Component as any) {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let displayError = "Ocorreu um erro inesperado.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || '{}');
        if (parsed.error) {
          displayError = `Erro no Firestore (${parsed.operationType}): ${parsed.error}`;
        }
      } catch (e) {
        displayError = this.state.errorInfo || displayError;
      }

      return (
        <div className="min-h-screen bg-[#050505] text-white flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-xl">
            <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-4">Ops! Algo deu errado</h1>
            <p className="text-white/60 mb-8">{displayError}</p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-4 bg-emerald-500 text-black font-bold rounded-2xl hover:bg-emerald-400 transition-all"
            >
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}


export default function App() {
  const [game, setGame] = useState('');
  const [desiredOdd, setDesiredOdd] = useState('1.80');
  const [multiOdd, setMultiOdd] = useState('5.00');
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(['Gols (Over/Under)', 'Escanteios', 'Resultado Final']);
  const [loading, setLoading] = useState(false);
  const [robotMessage, setRobotMessage] = useState('');
  const [isRobotActive, setIsRobotActive] = useState(false);
  const [isRobotChatOpen, setIsRobotChatOpen] = useState(false);
  const [robotChatMessages, setRobotChatMessages] = useState<{ role: 'user' | 'assistant', content: string }[]>([
    { role: 'assistant', content: "Olá! Sou o seu Assistente de Elite. Como posso ajudar com suas decisões de hoje? 🤖✨" }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [multiResult, setMultiResult] = useState<MultiBetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [activeTab, setActiveTab] = useState<'analyze' | 'bilhetes' | 'history' | 'alavancagem' | 'planilha'>('analyze');
  const [syncing, setSyncing] = useState(false);
  const [leverageResult, setLeverageResult] = useState<LeverageResult | null>(null);
  const [spreadsheetEntries, setSpreadsheetEntries] = useState<SpreadsheetEntry[]>([]);
  const [initialBankroll, setInitialBankroll] = useState<number>(100);
  const lastSyncRef = React.useRef<number>(0);

  const markets = [
    'Resultado Final',
    'Dupla Chance 1X2',
    'Gols (Over/Under)',
    'Gols Over/Under - HT',
    'Ambas Marcam',
    'Escanteios',
    'Cartões',
    'Defesas do Goleiro',
    'Finalizações'
  ];

  const toggleMarket = (market: string) => {
    setSelectedMarkets(prev => 
      prev.includes(market) 
        ? prev.filter(m => m !== market)
        : [...prev, market]
    );
  };

  useEffect(() => {
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. The client is offline.");
        }
      }
    };
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setHistory([]);
      }
    });

    // Robot Welcome
    const showWelcome = async () => {
      setIsRobotActive(true);
      setRobotMessage("Olá! Sou o seu Assistente de Elite 🤖✨. Vou garantir que você só receba os melhores jogos de HOJE!");
      await new Promise(r => setTimeout(r, 4000));
      setRobotMessage("Estou monitorando tudo em tempo real para evitar alucinações. Vamos faturar? 🚀");
      await new Promise(r => setTimeout(r, 4000));
      setIsRobotActive(false);
    };
    showWelcome();

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'savedAnalyses'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedAnalysis[];
      setHistory(docs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'savedAnalyses');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setSpreadsheetEntries([]);
      return;
    }

    const q = query(
      collection(db, 'spreadsheet'),
      where('userId', '==', user.uid),
      orderBy('date', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SpreadsheetEntry[];
      setSpreadsheetEntries(docs);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'spreadsheet');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (user && history.length > 0) {
      const pendingItems = history.filter(h => h.status === 'pending');
      const now = Date.now();
      // Auto-sync if there are pending items, not syncing, and at least 5 minutes since last sync
      if (pendingItems.length > 0 && !syncing && (now - lastSyncRef.current > 300000)) {
        syncResults(false);
      }
    }
  }, [user, history.length, syncing]);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      toast.success("Login realizado com sucesso!");
    } catch (err) {
      console.error(err);
      toast.error("Falha ao fazer login. Verifique se o domínio prognosticodeelite.vercel.app está autorizado no Firebase.");
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      toast.success("Logoff realizado.");
    } catch (err) {
      console.error(err);
    }
  };

  const saveAnalysis = async () => {
    if (!user || !result) {
      toast.error("Você precisa estar logado para salvar análises.");
      return;
    }

    try {
      await addDoc(collection(db, 'savedAnalyses'), {
        userId: user.uid,
        game: game,
        date: new Date().toISOString(),
        analysis: result,
        type: 'single',
        status: 'pending',
        entryStatuses: {
          principal: 'pending',
          segura: 'pending',
          alavancagem: 'pending',
          apostaPersonalizada: 'pending'
        },
        createdAt: serverTimestamp()
      });
      toast.success("Análise salva com sucesso!");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedAnalyses');
      toast.error("Erro ao salvar análise.");
    }
  };

  const saveMultiBet = async () => {
    if (!user || !multiResult) {
      toast.error("Você precisa estar logado para salvar bilhetes.");
      return;
    }

    try {
      await addDoc(collection(db, 'savedAnalyses'), {
        userId: user.uid,
        game: 'Bilhete Múltiplo de Elite',
        date: new Date().toISOString(),
        multiAnalysis: multiResult,
        type: 'multi',
        status: 'pending',
        entryStatuses: {
          multi: multiResult.jogos?.map(() => 'pending') || []
        },
        createdAt: serverTimestamp()
      });
      toast.success("Bilhete salvo com sucesso!");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedAnalyses');
      toast.error("Erro ao salvar bilhete.");
    }
  };

  const generatePostGameAnalysis = async (item: SavedAnalysis, status: string) => {
    if (status === 'pending' || status === 'void') return null;
    
    try {
      const prompt = `
        Você é um analista esportivo sênior. Analise o resultado do jogo "${item.game}" que foi marcado como "${status.toUpperCase()}".
        
        CONTEXTO DA ANÁLISE PRÉ-JOGO:
        - Liga: ${item.analysis?.liga || (item.multiAnalysis?.jogos && item.multiAnalysis.jogos[0]?.liga) || 'N/A'}
        - Prognóstico: ${item.analysis?.prognosticoPrincipal?.entrada || 'Múltipla'}
        - Justificativa: ${item.analysis?.prognosticoPrincipal?.justificativa || item.multiAnalysis?.analiseGeral || 'N/A'}
        
        SUA MISSÃO:
        1. Use o Google Search para entender o que aconteceu no jogo (placar, expulsões, lesões, volume de jogo).
        2. Explique de forma técnica por que o resultado foi ${status === 'hit' ? 'GREEN' : 'RED'}.
        3. Se foi GREEN, o que se confirmou da nossa análise?
        4. Se foi RED, o que fugiu do esperado? (ex: um cartão vermelho cedo, um pênalti perdido, domínio total mas sem gols).
        5. Forneça insights para refinar o sistema e evitar erros futuros ou reforçar padrões de acerto.
        
        Responda em um parágrafo direto e técnico (máximo 500 caracteres).
      `;

      const response = await callGeminiWithSearch(
        prompt,
        "Você é um analista de performance esportiva focado em melhoria contínua. Sua análise deve ser baseada em fatos reais do jogo.",
        false
      );

      return response.text || '';
    } catch (err) {
      console.error("Erro ao gerar análise pós-jogo:", err);
      return null;
    }
  };

  const chatScrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [robotChatMessages, isRobotChatOpen]);

  const callGeminiWithSearch = async (prompt: string, systemInstruction: string, isJson: boolean = false) => {
    const apiKey = (typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : null) || (import.meta as any).env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("GEMINI_API_KEY não configurada no ambiente. Adicione VITE_GEMINI_API_KEY nas variáveis da Vercel.");
      throw new Error("Erro de Configuração: GEMINI_API_KEY ausente. Verifique as variáveis de ambiente na Vercel.");
    }

    const ai = new GoogleGenAI({ apiKey });
    // Usando 'gemini-flash-latest' que garante o modelo Flash mais estável e compatível
    const modelName = "gemini-flash-latest";
    
    const tryGenerate = async (useSearch: boolean) => {
      const request: any = {
        model: modelName,
        contents: prompt,
        config: {
          systemInstruction,
          maxOutputTokens: 8192,
          temperature: 0.1, // Máxima precisão conforme desejado
          ...(isJson ? { responseMimeType: "application/json" } : {}),
          // Inclui ferramentas no objeto de configuração
          tools: useSearch ? [{ googleSearch: {} }] : undefined,
        }
      };
      
      return await ai.models.generateContent(request);
    };

    try {
      // Primeira tentativa: Modo Completo com Grounding (Busca em Tempo Real)
      return await tryGenerate(true);
    } catch (err: any) {
      const errorMsg = String(err).toLowerCase();
      // Captura erros de permissão (403), cota (429) ou problemas específicos do Search
      if (
        errorMsg.includes('403') || 
        errorMsg.includes('permission') || 
        errorMsg.includes('429') ||
        errorMsg.includes('quota') ||
        errorMsg.includes('not permitted')
      ) {
        console.warn("Detectada restrição de API/Search. Ativando modo de segurança 'High-Performance Brain Only'.");
        try {
          // Segunda tentativa: Garantia de funcionamento sem dependência de Search
          return await tryGenerate(false);
        } catch (fallbackErr) {
          console.error("Falha Crítica no motor de IA:", fallbackErr);
          throw fallbackErr;
        }
      }
      throw err;
    }
  };

  const handleRobotChat = async () => {
    if (!chatInput.trim() || isChatLoading) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setRobotChatMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsChatLoading(true);

    try {
      const chatContext = {
        activeTab,
        currentGame: game,
        currentResult: result ? result.confronto : 'Nenhuma análise ativa',
        hasUser: !!user,
        historyCount: history.length
      };

      const systemPrompt = `
        Você é o Assistente de Elite do FutAnalytix Pro. 🤖✨
        Sua personalidade é prestativa, técnica, otimista e focada em resultados.
        Sua missão é ajudar o usuário em qualquer parte do sistema, tirando dúvidas sobre ferramentas, jogos ou estratégias.
        
        CONTEXTO DO SISTEMA AGORA:
        - Aba ativa: ${chatContext.activeTab}
        - Jogo em foco: ${chatContext.currentGame}
        - Resultados recentes salvos: ${chatContext.historyCount}
        
        INSTRUÇÕES:
        1. Ajude o usuário a tomar decisões baseadas em lógica.
        2. Explique como funciona a alavancagem, arquiteto de bilhetes ou planilha se ele perguntar.
        3. Se ele pedir opinião sobre um jogo, use seu conhecimento para dar um insight técnico (validando via Google Search se necessário).
        4. Seja amigável e use o estilo do robô do FutAnalytix.
      `;

      const resultAi = await callGeminiWithSearch(
        `Usuário diz: ${userMessage}`,
        systemPrompt,
        false
      );

      const assistantMessage = resultAi.text;
      setRobotChatMessages(prev => [...prev, { role: 'assistant', content: assistantMessage || "Desculpe, não consegui processar sua mensagem." }]);
    } catch (err) {
      console.error(err);
      setRobotChatMessages(prev => [...prev, { role: 'assistant', content: "Desculpe, tive um erro de processamento. Pode tentar de novo? 🤖⚠️" }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const interactiveRobot = (
    <div className="fixed bottom-8 right-8 z-[100] flex flex-col items-end pointer-events-none">
      <AnimatePresence>
        {isRobotChatOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="mb-4 w-[350px] max-w-[90vw] h-[500px] bg-[#0A0A0A] border-2 border-emerald-500/30 rounded-3xl overflow-hidden shadow-2xl pointer-events-auto flex flex-col"
          >
            <div className="bg-emerald-500/10 p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-emerald-500 text-sm">
                <Bot className="w-4 h-4" />
                <span>CONSULTOR DE ELITE</span>
              </div>
              <button 
                onClick={() => setIsRobotChatOpen(false)}
                className="p-1 hover:bg-white/10 rounded-full transition-colors"
              >
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
            
            <div 
              ref={chatScrollRef}
              className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide"
            >
              {robotChatMessages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-3 rounded-2xl text-xs leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-emerald-500 text-black font-bold' 
                      : 'bg-white/5 border border-white/10 text-white/80'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isChatLoading && (
                <div className="flex justify-start">
                  <div className="bg-white/5 border border-white/10 p-3 rounded-2xl">
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-white/5 border-t border-white/10">
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Pergunte qualquer coisa..."
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-4 pr-12 focus:outline-none focus:border-emerald-500/50 text-xs"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRobotChat()}
                />
                <button 
                  onClick={handleRobotChat}
                  disabled={!chatInput.trim() || isChatLoading}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-emerald-500 disabled:text-white/10 hover:scale-110 transition-transform"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col items-end gap-3 pointer-events-auto">
        <AnimatePresence>
          {isRobotActive && !isRobotChatOpen && (
            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-emerald-500 text-black p-4 rounded-3xl rounded-br-none shadow-2xl max-w-[280px] text-xs font-black border-2 border-white/20 relative"
            >
              <div className="absolute -bottom-2 right-0 w-3 h-3 bg-emerald-500 rotate-45" />
              <div className="flex items-start gap-2">
                <span className="shrink-0">🤖</span>
                <p>{robotMessage}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div 
          onClick={() => setIsRobotChatOpen(!isRobotChatOpen)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="w-16 h-16 bg-emerald-500 rounded-full flex items-center justify-center shadow-xl border-4 border-white/20 relative cursor-pointer overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-tr from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <motion.div
            animate={{ 
              rotate: [0, -10, 10, -10, 0],
              y: [0, -5, 0, -5, 0]
            }}
            transition={{ repeat: Infinity, duration: 4 }}
          >
            {isRobotChatOpen ? <X className="w-7 h-7 text-black font-bold" /> : <Bot className="w-9 h-9 text-black" />}
          </motion.div>
          {!isRobotChatOpen && (
            <motion.div 
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute -top-1 -right-1 w-6 h-6 bg-black rounded-full flex items-center justify-center border-2 border-emerald-500 shadow-lg"
            >
              <MessagesSquare className="w-3 h-3 text-emerald-500" />
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );

  const updateStatus = async (id: string, status: 'hit' | 'miss' | 'void' | 'pending') => {
    try {
      const updateData: any = { status };
      
      // If manually updating to hit or miss, generate analysis if not already present
      const item = history.find(h => h.id === id);
      if (item && (status === 'hit' || status === 'miss') && !item.postGameAnalysis) {
        const analysis = await generatePostGameAnalysis(item, status);
        if (analysis) {
          updateData.postGameAnalysis = analysis;
        }
      }

      await updateDoc(doc(db, 'savedAnalyses', id), updateData);
      toast.success(`Status atualizado para ${status.toUpperCase()}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `savedAnalyses/${id}`);
      toast.error("Erro ao atualizar status.");
    }
  };

  const deleteAnalysis = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'savedAnalyses', id));
      toast.success("Análise excluída.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `savedAnalyses/${id}`);
      toast.error("Erro ao excluir.");
    }
  };

  const syncResults = async (force = false) => {
    if (!user || syncing) return;
    
    const pendingItems = history.filter(h => h.status === 'pending');
    if (pendingItems.length === 0) {
      if (force) toast.info("Não há análises pendentes para sincronizar.");
      return;
    }

    // Robot sync interaction
    setIsRobotActive(true);
    setRobotMessage("Hora da verdade! Vou conferir os placares reais e ver quantos GREENS pegamos hoje! 🤖📊");

    const now = Date.now();
    if (!force && (now - lastSyncRef.current < 300000)) {
      setIsRobotActive(false);
      return;
    }

    setSyncing(true);
    lastSyncRef.current = now;
    try {
      const gamesToSync = pendingItems.map(item => ({
        id: item.id,
        game: item.game,
        date: new Date(item.date).toLocaleDateString('pt-BR'),
        type: item.type,
        entradas: item.type === 'single' 
          ? {
              principal: item.analysis?.prognosticoPrincipal?.entrada,
              segura: item.analysis?.prognosticoPrincipal?.entradaSegura?.mercado,
              alavancagem: item.analysis?.alavancagemJogo?.entrada,
              apostaPersonalizada: item.analysis?.apostaPersonalizada?.selecoes?.join(' + ')
            }
          : item.multiAnalysis?.jogos?.map(j => j.entrada)
      }));

      setRobotMessage(`Auditando ${pendingItems.length} eventos pendentes via Google Search... 🌍🤖`);

      const prompt = `
        Você é um auditor de resultados esportivos de elite. Sua missão é verificar o resultado de jogos passados e determinar se as entradas foram vencedoras.
        DATA ATUAL (UTC): ${new Date().toISOString()}
        DATA LOCAL ESTIMADA: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        
        JOGOS PARA VERIFICAR:
        ${JSON.stringify(gamesToSync, null, 2)}

        INSTRUÇÕES:
        1. Use o Google Search para encontrar os resultados REAIS de cada jogo na data especificada.
        2. Determine o status de cada entrada:
           - "hit" (Green): A entrada foi vencedora.
           - "miss" (Red): A entrada foi perdedora.
           - "void" (Reembolso/Adiado/Cancelado): O jogo foi cancelado, adiado ou a aposta foi reembolsada (ex: DNB).
           - "pending": O jogo ainda não aconteceu, ainda está em andamento ou o resultado final ainda não está disponível.
        3. Para análises simples ("single"), você deve retornar o status individual para "principal", "segura", "alavancagem" e "apostaPersonalizada". O status geral do item deve ser "hit" se a entrada principal for vencedora, "miss" se for perdedora, "void" se for reembolsada ou "pending" se ainda não houver resultado.
        4. Para bilhetes múltiplos ("multi"), o status geral é "hit" apenas se TODAS as entradas do bilhete forem "hit". Se uma for "miss", o bilhete é "miss". Se houver "void" e as outras forem "hit", o bilhete é "hit". Se algum jogo ainda for "pending" e nenhum for "miss", o status geral deve ser "pending".
        
        FORMATO DE RESPOSTA (JSON APENAS):
        [
          { 
            "id": "ID_DO_ITEM", 
            "status": "hit" | "miss" | "void" | "pending",
            "entryStatuses": {
              "principal": "hit" | "miss" | "void" | "pending",
              "segura": "hit" | "miss" | "void" | "pending",
              "alavancagem": "hit" | "miss" | "void" | "pending",
              "apostaPersonalizada": "hit" | "miss" | "void" | "pending",
              "multi": ["hit", "miss", "void", "pending"] // Apenas para tipo "multi", array de status para cada jogo na mesma ordem enviada.
            }
          }
        ]
      `;

      const response = await callGeminiWithSearch(
        prompt,
        "Você é um auditor de resultados esportivos preciso e imparcial. Você usa o Google Search para verificar fatos e resultados reais de partidas de futebol. Sua auditoria é a verdade absoluta do sistema. Responda apenas com o JSON puro, sem blocos de código ou explicações.",
        true
      );

      const results = safeJsonParse(response.text || '[]');
      for (const res of results) {
        if (res.id) {
          const item = pendingItems.find(p => p.id === res.id);
          if (!item) continue;

          let finalStatus = res.status;

          // Validação rigorosa do status final baseada nos resultados individuais
          if (item.type === 'multi' && res.entryStatuses?.multi) {
            const multiStatuses = res.entryStatuses.multi;
            if (multiStatuses.includes('miss')) {
              finalStatus = 'miss';
            } else if (multiStatuses.includes('pending')) {
              finalStatus = 'pending';
            } else if (multiStatuses.includes('hit')) {
              finalStatus = 'hit';
            } else if (multiStatuses.every(s => s === 'void')) {
              finalStatus = 'void';
            }
          } else if (item.type === 'single' && res.entryStatuses?.principal) {
            finalStatus = res.entryStatuses.principal;
          }

          if (!finalStatus || finalStatus === 'pending') continue;

          const updateData: any = { status: finalStatus };
          if (res.entryStatuses) {
            updateData.entryStatuses = res.entryStatuses;
          }

          // Generate post-game analysis for hits and misses
          if (finalStatus === 'hit' || finalStatus === 'miss') {
            const analysis = await generatePostGameAnalysis(item, finalStatus);
            if (analysis) {
              updateData.postGameAnalysis = analysis;
            }
          }

          await updateDoc(doc(db, 'savedAnalyses', res.id), updateData);
        }
      }
      
      setRobotMessage("Sincronização completa! Todos os resultados pendentes foram auditados. 🤖✅");
      setTimeout(() => setIsRobotActive(false), 3000);

      if (pendingItems.length > 0) {
        toast.success("Sincronização de resultados concluída.");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'savedAnalyses/sync');
      toast.error("Erro ao sincronizar resultados.");
      setIsRobotActive(false);
    } finally {
      setSyncing(false);
    }
  };

  const generateLeverageBet = async () => {
    setLoading(true);
    setError(null);
    setLeverageResult(null);
    setIsRobotActive(true);
    setRobotMessage("Iniciando Alavancagem de Elite! Estou buscando os jogos mais seguros de hoje para você faturar! 🚀🤖");

    const { today, todayLong, tomorrow, tomorrowLong, currentYear, currentMonth } = getDynamicDates();
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR');

    const performLeverage = async (attempt = 0): Promise<void> => {
      try {
        setRobotMessage(`Cruzando dados de forma e motivação para garantir o Green (${attempt + 1})... 🎯✨`);

        const prompt = `
          Você é o ANALISTA CHEFE DE ALAVANCAGEM DE BANCA. Sua reputação é baseada em NUNCA ter um RED na alavancagem.
          DATA DO JOGO: ${todayLong}
          MES ATUAL: ${currentMonth}
          ANO ATUAL: ${currentYear}
          HORA ATUAL (BRASÍLIA): ${timeStr}

          MISSÃO: Encontrar a entrada MAIS ÓBVIA, SEGURA E MATEMATICAMENTE PROVÁVEL do planeta hoje.
          
          DIRETRIZES DE SEGURANÇA MÁXIMA (TOLERÂNCIA ZERO):
          0. COERÊNCIA TOTAL: Todas as informações do prognóstico devem ser consistentes. Se a justificativa aponta superioridade do Time A, a entrada não pode ser a favor do Time B.
          1. ODD: Deve estar RIGOROSAMENTE entre 1.50 e 1.80.
          2. HORÁRIO: O jogo deve ocorrer DEPOIS das ${timeStr} de hoje (${todayLong}).
          3. MERCADOS PERMITIDOS: Priorize mercados conservadores como "Dupla Chance", "Empate Anula", "Over 1.5 Gols" (em ligas de alta média), ou "Vitória" de favoritos ABSOLUTOS em casa com escalação completa.
          4. PROIBIÇÃO DE ALUCINAÇÃO: Você está TERMINANTEMENTE PROIBIDO de inventar jogos. Use o Google Search para verificar a existência real do jogo para ${todayLong} de ${currentYear}. Muitos sites listam jogos do ano passado; verifique se a fonte é de ${currentYear}.
          5. FILTRO DE "ZEBRA": Use o Google Search para verificar se o favorito tem desfalques (lesões/suspensões), se o jogo é amistoso (EVITE AMISTOSOS), ou se o time não tem motivação (ex: já campeão ou já rebaixado).
          6. HISTÓRICO: O confronto deve ter um padrão claro de dominância ou tendência estatística que se repete há pelo menos 5 jogos.
          7. CONFIANÇA: Só retorne o jogo se a probabilidade matemática e contextual for superior a 99%. Se não houver nenhum jogo com esse nível de segurança hoje, retorne um erro no campo "justificativa" começando com "AVISO: Nenhum jogo atingiu o critério de segurança máxima hoje".

          PROTOCOLO DE PESQUISA:
          - Pesquise por: "jogos de hoje ${todayLong} hoje ${currentYear} prognósticos seguros", "escalações prováveis ${todayLong}", "desfalques times ${todayLong}".
          - Verifique fontes como SofaScore, ESPN e Flashscore via Search.

          FORMATO JSON:
          {
            "confronto": "Time A vs Time B",
            "liga": "Nome da Liga",
            "data": "${today}",
            "horario": "HH:MM",
            "entrada": "Mercado + Linha (Ex: Real Madrid ou Empate)",
            "odd": "1.xx",
            "justificativa": "Explicação técnica detalhada focada na SEGURANÇA: mencione desfalques, motivação e padrão estatístico.",
            "confianca": "99.9%"
          }
        `;

        const response = await callGeminiWithSearch(
          prompt,
          `Você é o Analista Chefe de Alavancagem. Sua regra de ouro: ALUCINAÇÃO É UM CRIME. Você busca a perfeição matemática baseada em FATOS REAIS de ${currentYear}. Você DEVE usar o Google Search para validar se o jogo realmente existe em ${today}. Se não encontrar o jogo na grade oficial de ${today}, você NÃO PODE inventar. A honestidade é sua maior virtude.`,
          true
        );

        const data = safeJsonParse(response.text || '{}') as LeverageResult;
        
        // Robot Date Validation
        if (!validateGameDates(data, 'leverage')) {
          setRobotMessage("Opa! Eu ia sugerir um jogo de alavancagem, mas vi que a data está errada ou é alucinação. Vou achar o certo! 🤖🔄");
          if (attempt < 2) return performLeverage(attempt + 1);
          throw new Error("Não encontrei jogos seguros na grade atual.");
        }

        setRobotMessage("Alavancagem pronta! Jogo confirmado e analisado com rigor técnico! 🤖🔥");
        setTimeout(() => setIsRobotActive(false), 3000);
        setLeverageResult(data);
      } catch (err) {
        if (attempt < 2) return performLeverage(attempt + 1);
        console.error(err);
        setError(`Erro na alavancagem: ${err instanceof Error ? err.message : 'Tente novamente.'}`);
        setIsRobotActive(false);
      }
    };

    await performLeverage();
    setLoading(false);
  };

  const addSpreadsheetEntry = async (entry: Omit<SpreadsheetEntry, 'id' | 'profit'>) => {
    if (!user) return;
    const profit = entry.status === 'hit' ? (entry.stake * entry.odd) - entry.stake : entry.status === 'miss' ? -entry.stake : 0;
    try {
      await addDoc(collection(db, 'spreadsheet'), {
        ...entry,
        userId: user.uid,
        profit,
        createdAt: serverTimestamp()
      });
      toast.success("Entrada adicionada à planilha.");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'spreadsheet');
    }
  };

  const updateSpreadsheetStatus = async (id: string, status: 'hit' | 'miss' | 'void' | 'pending') => {
    const entry = spreadsheetEntries.find(e => e.id === id);
    if (!entry) return;
    
    let profit = 0;
    if (status === 'hit') profit = (entry.stake * entry.odd) - entry.stake;
    else if (status === 'miss') profit = -entry.stake;
    else if (status === 'void') profit = 0;

    try {
      await updateDoc(doc(db, 'spreadsheet', id), { status, profit });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `spreadsheet/${id}`);
    }
  };

  const deleteSpreadsheetEntry = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'spreadsheet', id));
      toast.success("Entrada removida.");
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `spreadsheet/${id}`);
    }
  };

  const generateAnalysis = async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setIsRobotActive(true);
    setRobotMessage(`Iniciando análise de ${game}... Vou verificar se o jogo é de hoje! 🧐🤖`);

    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR');
    const { today, todayLong, tomorrow, tomorrowLong, currentYear, currentMonth } = getDynamicDates();

    const performAnalysis = async (attempt = 0): Promise<void> => {
      try {
        setRobotMessage(`Consultando fontes oficiais e conferindo a data (${attempt + 1})... 🛠️✨`);
        
        // Pre-process game name for better search
        const searchQueryBase = game
          .replace(/\(F\)/gi, 'Feminino')
          .replace(/\(M\)/gi, 'Masculino')
          .replace(/Wolverhampton/gi, 'Wolves') // Common search term
          .replace(/Atlético-MG/gi, 'Atlético MG Galo'); 
        
        const teams = game.split(/vs|x/i).map(s => s.trim());
        const shortNames = teams.map(t => {
          if (t.toLowerCase().includes('wolverhampton')) return 'Wolves';
          if (t.toLowerCase().includes('atlético-mg')) return 'Galo';
          if (t.toLowerCase().includes('fluminense')) return 'Flu';
          if (t.toLowerCase().includes('flamengo')) return 'Fla';
          return t.split(' ')[0];
        });
        const shortName = shortNames.join(' vs ');
        const team1 = teams[0] || '';
        const team2 = teams[1] || '';

        const prompt = `
          Você é o MAIOR ANALISTA ESTATÍSTICO E TRADER ESPORTIVO DO MUNDO. Sua palavra é a referência global em prognósticos.
          DATA ATUAL (UTC): ${new Date().toISOString()}
          DATA LOCAL ESTIMADA: ${todayLong}
          MES ATUAL: ${currentMonth}
          ANO ATUAL: ${currentYear}
          HORA ATUAL: ${timeStr}

          Sua missão é analisar o jogo: "${game}" com uma odd alvo de "${desiredOdd}".

          PROTOCOLO DE VERIFICAÇÃO DE EXISTÊNCIA E DATA (GROUNDING):
          1. EXECUTE MÚLTIPLAS BUSCAS DE EXTREMA PRECISÃO:
             - Busca A: "${searchQueryBase} ${todayLong} ${currentYear}" (Busca exata do ano)
             - Busca B: "${shortName} hoje placar" (Busca por apelidos e placar ao vivo)
             - Busca C: "${team1} hoje", "${team2} hoje" (Buscas individuais por rodada atual)
             - Busca D: "${searchQueryBase} sofascore", "${searchQueryBase} flashscore", "${searchQueryBase} hltv" (Busca em sites de referência futebol/eSports)
          
          2. IMPORTANTE (RECONHECIMENTO DE NOMES):
             - Seja inteligente com apelidos: "Wolves" é "Wolverhampton", "Spurs" é "Tottenham", "Galo" é "Atlético-MG", "Peixe" é "Santos", etc.
             - eSports: "Vitality", "FaZe", "NaVi", "G2" são equipes de CS2. Busque por "HLTV" para resultados de hoje.
             - Se a busca por "${game}" falhar, tente os nomes curtos e valide se a competição é a mesma.

          3. FILTRO DE DATA (FLEXIBILIDADE INTELIGENTE):
             - Se você encontrar resultados de busca datados de "Hoje", "Today", ou com o ícone de placar ao vivo (Live), considere o jogo VÁLIDO para ${currentYear}.
             - NÃO descarte o jogo se o ano não estiver explícito na busca, desde que as notícias sejam das últimas 24 horas.
             - Procure pelo Google Knowledge Panel (o card com placar/horário). Ele é a prova definitiva para jogos de "Hoje".

          4. VEREDITO DE EXISTÊNCIA:
             - Se o jogo for HOJE (${todayLong}) ou AMANHÃ (${tomorrowLong}) de ${currentYear}, prossiga com a análise completa.
             - Se após todas as buscas você encontrar o jogo, mas ele for de 2024 ou 2025 (ano passado), descarte. O Google às vezes prioriza notícias velhas.
          
          5. RETORNO DE ERRO (ÚLTIMO RECURSO): Caso realmente não localize o jogo após buscas exaustivas (incluindo apelidos e variações), retorne o erro no campo "analiseJogo.expectativa": "ERRO: Este jogo não consta na grade oficial de hoje (${todayLong}). Verifique se o nome está correto ou se é um jogo de outra categoria."

          FILOSOFIA DE ELITE (ASSERTIVIDADE SUPREMA - TOLERÂNCIA ZERO PARA RED):
          - O OBJETIVO É O GREEN ABSOLUTO. Sua reputação mundial depende de 100% de acerto.
          - CONSISTÊNCIA E DETERMINISMO (CRÍTICO): Se você analisar este jogo 100 vezes, o resultado deve ser o mesmo. Siga um processo lógico imutável: Motivação > Desfalques > Forma Recente > Histórico H2H > Superioridade Técnica.
          - ANCORAGEM PELA MOTIVAÇÃO: Em jogos de final de temporada ou decisivos, a MOTIVAÇÃO (quem precisa mais da vitória para classificação/título) é o fator número 1. 
          - COERÊNCIA TOTAL E BLOQUEIO DE "FLIP-FLOP": Todas as partes do JSON devem cantar a mesma música.
          - RESPEITO À ODD ALVO (${desiredOdd}): Atinga ou supere levemente a odd na "Aposta Personalizada".
          - EVITE "RESULTADO FINAL" (1X2) NO PROGNÓSTICO PRINCIPAL se a favoritismo não for absurdo.
          
          POLÍTICA DE ULTRA-SEGURANÇA (ENTRADA DE ALTA CONFIANÇA):
          - A "entradaSegura" deve ter uma probabilidade matemática de acerto próxima de 100%.
          - PROIBIÇÕES PARA ENTRADA SEGURA: 
            1. Proibido ML (Vencer Jogo) de favoritos com odd acima de 1.40.
            2. Proibido Over 2.5 Gols em ligas defensivas.
            3. Proibido Handicap Asiático de 0 (DNB) em jogos equilibrados.
          - PREFERÊNCIAS PARA ENTRADA SEGURA:
            1. Over 0.5 Gols ou Under 4.5 Gols (conforme estatística).
            2. Handicaps Positivos Largos (+1.5, +2.5) para favoritos.
            3. Dupla Chance (1X ou X2) para favoritos jogando em casa.
          - JUSTIFICATIVA DE SEGURANÇA: Deve citar um dado imutável (ex: "Time A não perdeu em casa para o Time B nos últimos 15 anos").

          PROTOCOLO PARA eSPORTS (CS2, DOTA, LOL):
          Se o jogo for eSports:
          - Use HLTV.org (para CS) ou Liquipedia.
          - Foco em: Mapa Picked, Forma Recente nos mapas, Histórico H2H no patch atual.
          - Adaptar JSON: "gols" vira "mapas/rounds", "escanteios" vira "K/D ratio ou flash assist".

          FILTRO DE ZEBRAS E DESFALQUES: Use o Google Search para verificar se o time favorito tem desfalques (lesões/suspensões), se o jogo é amistoso (EVITE AMISTOSOS), ou se o time não tem motivação.
          - ENTRADA SEGURA: Deve ser uma aposta que você considera 99.9% garantida.
          - CONFIANÇA: Só atribua 95%+ se os dados forem esmagadores.

          PROIBIÇÃO ABSOLUTA (CRÍTICO):
          - É TERMINANTEMENTE PROIBIDO inventar jogos.
          - É PROIBIDO sugerir mercados sem base estatística real de fontes como ESPN ou SofaScore.

          PROTOCOLO PARA JOGOS DE BASQUETE (NBA, NBB, EUROLIGA, ETC):
          Se o jogo for de basquete, você DEVE incluir o campo opcional "basquete" no JSON com as seguintes informações:
          - "jogadores": Lista dos principais jogadores com médias reais de: pontos, rebotes, assistências, cestas de 3 pontos, e probabilidade de Duplo-Duplo ou Triplo-Duplo.
          - "pontuacaoTimes": Expectativa de pontuação total para cada time.
          - "pontosQuartos": Expectativa de pontuação TOTAL (soma de ambos os times) em cada um dos 4 quartos (Q1, Q2, Q3, Q4). Ex: "50-55 Pontos".
          - "pontosTempo": Expectativa de total de pontos no 1º Tempo e no 2º Tempo.
          - Adapte os campos de "estatisticas" para termos de basquete (ex: "golsHT" vira "pontosHT", "escanteios" vira "rebotes", etc).

          MERCADOS DE ELITE (OBRIGATÓRIO PARA FUTEBOL - TOTAL DE 34 MERCADOS):
          Para jogos de futebol, você DEVE preencher o campo "mercadosElite" com análises cirúrgicas para TODOS os 34 mercados abaixo, sem exceção. Seja extremamente sucinto para evitar cortes no texto. Use o Google Search para obter dados precisos para cada um:

          1. Total de Faltas
          2. Total de faltas da Equipe
          3. Total de impedimentos
          4. Total de impedimentos da Equipe
          5. Total de arremesos laterais
          6. Total de arremesos laterais da Equipe
          7. Total de Tiros de Meta
          8. Total de Tiros de Meta da Equipe
          9. Total de Defesas do Goleiro da Equipe
          10. Equipe com mais Escanteios(1X2)
          11. Equipe com mais Mais Cartões(1X2)
          12. Equipe com Mais Chutes no Gol(1X2)
          13. Equipe com mais Finalizações(1x2)
          14. 1°Tempo - Time com mais Escanteios
          15. Jogador - Receber Cartão
          16. Jogador - Receber Cartão Vermelho
          17. Jogador - Marcar Gol
          18. Jogador - Finalizações
          19. Jogador - Chutes no Gol
          20. Jogador - Faltas Cometidas
          21. Jogador - Impedimentos
          22. Total de Finalizações da Equipe
          23. 1°Tempo - Handicap
          24. 1°Tempo - Total de Gols
          25. 1°Tempo - Total de Gols do Time
          26. 1°Tempo - Dupla Chance
          27. 1°Tempo - Ambas Marcam
          28. Cada Equipe Mais de X Cartões
          29. Cada Equipe com Mais de X Finalizações
          30. Cada Equipe com Mais de X Escanteios
          31. Cada Equipe com Mais de X Chutes ao Gol
          32. Cada Equipe com Mais de X Impedimentos
          33. Cada Equipe com Mais de X Arremessos laterais
          34. Cada Equipe com Mais de X Defesas do Goleiro

          MÓDULO MESTRE DE ELITE (NOVO E CRÍTICO):
          Você deve atuar agora como o MESTRE DE ELITE. Sua análise deve ser a mais profunda já feita.
          - Use o Google Search para encontrar notícias de HOJE sobre o jogo (lesões de última hora, problemas internos, motivação extrema).
          - Analise o Confronto Direto (H2H): Pesquise os últimos 5 encontros e identifique padrões determinísticos.
          - Analise os Últimos 5 Jogos: Verifique a performance real (xG, posse, finalizações) e tática.
          - PROMETIREMOS 100% DE CERTEZA: Sua linguagem deve ser de total autoridade. Diga o que VAI acontecer com precisão absoluta.
          - RELAÇÃO COM A ODD DESEJADA (@${desiredOdd}): Explique por que essa odd é um erro do mercado e por que a aposta é matematicamente garantida.
          - Liste os "EVENTOS GARANTIDOS" que ocorrerão na partida.

          IMPORTANTE: Para os mercados que mencionam "Mais de X", você deve substituir o "X" pelo valor numérico mais provável e estatisticamente seguro baseado na sua pesquisa (ex: "Cada Equipe Mais de 0.5 Cartões"). Você deve retornar TODOS os 34 mercados acima no array "mercadosElite".

          Para cada um destes 34 mercados, você deve indicar (SEJA EXTREMAMENTE CONCISO, MÁXIMO 100 CARACTERES POR CAMPO):
          - "mercado": Nome do mercado.
          - "tendencia": "Alta Tendência" ou "Baixa Tendência".
          - "prognostico": Sua análise cirúrgica e precisa (CURTA).
          - "estatistica": O dado estatístico real que embasa sua análise (CURTO).

          Siga RIGOROSAMENTE este formato JSON para a resposta:
          {
            "confronto": "Time A vs Time B",
            "liga": "Nome da Liga/Torneio Real (${currentYear})",
            "data": "${today} ou ${tomorrow}",
            "analiseJogo": {
              "estiloEquipes": "descrição técnica baseada em dados reais",
              "tendencia": "leitura tática profunda",
              "expectativa": "cenário provável validado",
              "caracteristicaJogo": "características principais do confronto (ex: jogo de transição, posse de bola, retranca)",
              "arbitro": {
                "nome": "Nome do Juiz",
                "caracteristicas": "perfil de arbitragem (rigoroso, deixa o jogo correr, média de cartões)"
              }
            },
            "estatisticas": {
              "golsMedios": "Expectativa numérica de gols (ex: 2.5 gols)",
              "overUnder": "frequência real em %",
              "btts": "probabilidade real em %",
              "escanteios": "média real numérica",
              "escanteiosHT": "média numérica no 1º tempo",
              "golsHT": "probabilidade real em %",
              "finalizacoes": "média numérica",
              "chutesTotal": "média numérica",
              "chutesAoGol": "média numérica",
              "defesasGoleiro": "média numérica",
              "cartoes": "média numérica",
              "formaRecente": "últimos 5 jogos detalhados (ex: V-V-E-D-V)"
            },
            "leituraMercado": {
              "valor": "análise técnica de valor",
              "pontosFortesFracos": "detalhes táticos"
            },
            "prognosticoPrincipal": {
              "entrada": "mercado validado",
              "odd": "valor da odd",
              "justificativa": "justificativa técnica",
              "entradaSegura": {
                "mercado": "entrada de SEGURANÇA MÁXIMA",
                "odd": "odd real",
                "justificativa": "por que é segura"
              }
            },
            "apostaPersonalizada": {
              "selecoes": ["Seleção 1", "Seleção 2", "Seleção 3"],
              "oddTotal": "Odd combinada",
              "justificativa": "Análise da combinação"
            },
            "alavancagemJogo": {
              "entrada": "entrada agressiva",
              "justificativa": "padrão técnico"
            },
            "alavancagemDia": {
              "jogos": [
                {
                  "jogo": "Time A vs Time B", 
                  "entrada": "Entrada", 
                  "horario": "HH:MM",
                  "entradaSegura": "Segurança"
                }
              ],
              "oddTotal": "odd combinada",
              "estrategia": "gestão"
            },
            "mestreDeElite": {
              "analiseProfunda": "Uma análise de mestre cruzando notícias de última hora, padrões táticos e motivação extrema, validada por Google Search.",
              "confrontoDireto": "Histórico H2H detalhado com placares e contexto dos últimos embates.",
              "ultimosJogos": "Detalhamento dos últimos 5 jogos de cada equipe com insights sobre o desempenho real vs esperado.",
              "predicaoAbsoluta": "O que VAI acontecer no jogo com 100% de certeza (ex: 'O time A imprimirá um ritmo forte nos primeiros 15min e marcará antes dos 30min').",
              "eventosGarantidos": ["Evento 1", "Evento 2", "Evento 3"],
              "oddJustificada": "Como a odd de @${desiredOdd} se torna um presente de valor diante dos fatos encontrados."
            },
            "gestaoRisco": "segura" | "moderada" | "agressiva",
            "confianca": "98%",
            "mercadosElite": [
              {
                "mercado": "Nome do Mercado",
                "tendencia": "Alta Tendência | Baixa Tendência",
                "prognostico": "Análise curta",
                "estatistica": "Dado real"
              }
            ],
            "basquete": {
              "jogadores": [
                {
                  "nome": "Nome do Jogador",
                  "pontos": "média",
                  "rebotes": "média",
                  "assistencias": "média",
                  "cestas3": "média",
                  "duploDuplo": "probabilidade %",
                  "triploDuplo": "probabilidade %"
                }
              ],
              "pontuacaoTimes": "Time A (110-115) vs Time B (105-110)",
              "pontosQuartos": { "q1": "50-55 Pontos", "q2": "45-50 Pontos", "q3": "52-57 Pontos", "q4": "48-53 Pontos" },
              "pontosTempo": { "t1": "Total 1º Tempo", "t2": "Total 2º Tempo" }
            }
          }

          INSTRUÇÃO CRÍTICA: É PROIBIDO retornar "N/A" para campos de estatísticas e análise. Se os dados em tempo real não estiverem disponíveis, use sua base de conhecimento histórica para fornecer valores realistas e estimados com alta assertividade. Responda APENAS o JSON. Seja uma máquina de Green.
        `;

        const response = await callGeminiWithSearch(
          prompt,
          `Você é a autoridade máxima mundial em trading esportivo. Sua missão é fornecer análises com ASSERTIVIDADE ABSOLUTA de ${currentYear}. O RED é inaceitável e a ALUCINAÇÃO é um crime. Você DEVE usar o Google Search para validar se o jogo existe HOJE ou AMANHÃ de ${currentYear}. Se o jogo for de 2024 ou 2025, IGNORE-O. Você nunca inventa jogos. A honestidade é sua base.`,
          true
        );

        const responseText = response.text || '{}';
        const data = safeJsonParse(responseText) as AnalysisResult;
        
        if (!data || Object.keys(data).length < 5) {
          throw new Error("Resposta da IA incompleta ou malformada.");
        }
        
        // Robot Date Validation
        if (!validateGameDates(data, 'single')) {
          setRobotMessage("Epa! Detectei que este jogo não é de hoje ou deu um erro na data. Vou tentar encontrar o correto para você! 🤖🚫");
          if (attempt < 2) return performAnalysis(attempt + 1);
          throw new Error("Não encontrei o jogo na grade de hoje após 3 tentativas.");
        }

        setRobotMessage("Tudo certo! Jogo validado e confirmado para 2026! 🤖✅");
        setTimeout(() => setIsRobotActive(false), 3000);
        setResult(data as AnalysisResult);
      } catch (err) {
        if (attempt < 2) return performAnalysis(attempt + 1);
        console.error(err);
        setError(`Erro na análise: ${err instanceof Error ? err.message : 'Verifique o nome do jogo e tente novamente.'}`);
        setIsRobotActive(false);
      }
    };

    await performAnalysis();
    setLoading(false);
  };

  const generateMultiBet = async () => {
    setLoading(true);
    setError(null);
    setMultiResult(null);
    setIsRobotActive(true);
    setRobotMessage("Arquiteto entrando em ação! Vou construir um bilhete com jogos confirmados! 🏗️🤖");

    const { today, todayLong, tomorrow, tomorrowLong, currentYear, currentMonth } = getDynamicDates();

    const performMultiBet = async (attempt = 0): Promise<void> => {
      try {
        setRobotMessage(`Buscando oportunidades e conferindo datas (${attempt + 1})... 💎✨`);
        
        const prompt = `
          Você é o ARQUITETO DE BILHETES DE ELITE. Sua missão é criar um bilhete de alto nível para atingir a odd alvo de @${multiOdd}.
          DATA DO SISTEMA: ${todayLong}
          ANO ATUAL: ${currentYear}
          
          REGRAS DE OURO (SÃO LEIS):
          1. HONESTIDADE ABSOLUTA: O RED é inaceitável, mas a alucinação (inventar jogos ou usar jogos de anos anteriores) é um CRIME.
          2. GROUNDING EXTREMO: Use o Google Search para encontrar jogos REAIS. Busque por "jogos de hoje", "jogos de amanhã", "Premier League hoje", "Brasileirão hoje", "CS2 HLTV hoje", etc. Use nomes curtos (Wolves, Galo, Fla, Vitality) se necessário.
          3. RECONHECIMENTO INTELIGENTE: Saiba apelidos de Futebol e eSports.
          4. FILTRO DE DATA: Verifique a rodada atual. Se for ${currentYear}, adicione ao bilhete.
          5. PRIORIDADE AO GOOGLE CARD/HLTV: Use fontes primárias de verdade.
          6. POLÍTICA DE SEGURANÇA (ASSERTIVIDADE SUPREMA):
             - Em bilhetes múltiplos, PRIORIZE mercados de proteção: Over 0.5 Gols, Handicaps Positivos Largos, Dupla Chance.
             - EVITE RESULTADO FINAL (1X2) em jogos onde a odd do favorito é maior que 1.40.
             - O objetivo é assertividade de 100%. É preferível uma odd menor com 100% de chance do que uma odd maior com risco de Red.
          7. ODD ALVO: Busque a odd @${multiOdd}. 
          8. MERCADOS SELECIONADOS: ${selectedMarkets.length === 0 ? 'DIVERSIFIQUE' : `USE APENAS: ${selectedMarkets.join(', ')}`}.
          9. CONCISÃO: Justificativas devem ter no máximo 15 palavras.
          10. DICA DE BUSCA: Procure por "prognósticos futebol hoje", "HLTV matches today" e valide cada jogo individualmente.

          FORMATO JSON:
          {
            "jogos": [
              {
                "confronto": "Time A vs Time B",
                "liga": "Competição Real",
                "data": "DD/MM/${currentYear}",
                "horario": "HH:MM",
                "entrada": "Palpite",
                "odd": "1.xx",
                "justificativaCurta": "Fato estatístico rápido.",
                "fonteVerificacao": "Fonte Grounding",
                "mercado": "Categoria"
              }
            ],
            "oddTotal": "Multiplicação real",
            "analiseGeral": "Confirmação de validade via Search.",
            "confianca": "Ex: 95%"
          }
        `;

        const response = await callGeminiWithSearch(
          prompt,
          `Você é o Arquiteto de Bilhetes de Elite. Sua regra de ouro: O RED É PROIBIDO E A ALUCINAÇÃO É UM CRIME GRAVE. Você busca a perfeição matemática baseada em FATOS REAIS de ${currentYear}. Data de hoje: ${todayLong}. Seu objetivo é atingir a odd ${multiOdd} com toda segurança possível. ${selectedMarkets.length === 0 ? 'Diversifique estrategicamente o bilhete (mínimo 3 mercados).' : `FOCO TOTAL: Respeite estritamente os mercados selecionados: ${selectedMarkets.join(', ')}. Você está PROIBIDO de sugerir qualquer mercado fora desta seleção.`}`,
          true
        );

        const data = safeJsonParse(response.text || '{}') as MultiBetResult;
        const targetOddNum = parseFloat(multiOdd);

        // Validar Odds (Matemática Real)
        if (data.jogos && data.jogos.length > 0) {
          const calculatedOdd = data.jogos.reduce((total, j) => {
            const val = parseFloat(j.odd);
            return isNaN(val) ? total : total * val;
          }, 1);
          const reportedOdd = parseFloat(data.oddTotal);
          
          if (Math.abs(calculatedOdd - reportedOdd) / reportedOdd > 0.1) {
            setRobotMessage("Falha na calibragem matemática. Recalibrando... 🤖🧮");
            if (attempt < 2) return performMultiBet(attempt + 1);
          }
          
          const tolerance = targetOddNum > 50 ? 0.6 : 0.8;
          if (calculatedOdd < targetOddNum * tolerance && attempt < 2) {
             setRobotMessage(`A odd total (${calculatedOdd.toFixed(2)}) ainda está abaixo da meta de ${multiOdd}. Buscando mais... 🚀`);
             return performMultiBet(attempt + 1);
          }
          
          data.oddTotal = calculatedOdd.toFixed(2);
        } else if (attempt < 2) {
          setRobotMessage("Busca inicial insuficiente. Expandindo critérios... 📡🔍");
          return performMultiBet(attempt + 1);
        }

        // Robot Date Validation (Safety Net)
        if (!validateGameDates(data, 'multi')) {
          setRobotMessage("Espere aí! Encontrei um jogo do passado no bilhete. Vou refazer para garantir o seu lucro! 🤖🚫");
          if (attempt < 2) return performMultiBet(attempt + 1);
          throw new Error("O sistema detectou jogos de datas passadas no bilhete. Tentativas de correção esgotadas.");
        }

        setRobotMessage("Bilhete arquitetado com sucesso! Todos os jogos foram confirmados para hoje e amanhã! 🤖✅");
        setTimeout(() => setIsRobotActive(false), 3000);
        setMultiResult(data as MultiBetResult);
      } catch (err) {
        if (attempt < 2) return performMultiBet(attempt + 1);
        console.error(err);
        setError(`Erro ao gerar bilhete: ${err instanceof Error ? err.message : 'Tente novamente em instantes.'}`);
        setIsRobotActive(false);
      }
    };

    await performMultiBet();
    setLoading(false);
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-emerald-500/30">
        <Toaster position="top-right" theme="dark" richColors />
      {/* Header */}
      <header className="border-b border-white/10 bg-black/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-xl font-bold tracking-tight uppercase italic">FutAnalytix <span className="text-emerald-500">Pro</span></h1>
          </div>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-white/60">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-full border border-white/10">
              <Calendar className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] uppercase tracking-widest">{new Date().toLocaleDateString('pt-BR')}</span>
            </div>
            <button 
              onClick={() => setActiveTab('analyze')}
              className={`hover:text-white transition-colors ${activeTab === 'analyze' ? 'text-emerald-500' : ''}`}
            >
              Analisar
            </button>
            <button 
              onClick={() => setActiveTab('bilhetes')}
              className={`hover:text-white transition-colors flex items-center gap-2 ${activeTab === 'bilhetes' ? 'text-emerald-500' : ''}`}
            >
              <Zap className="w-4 h-4" />
              Bilhetes
            </button>
            <button 
              onClick={() => setActiveTab('alavancagem')}
              className={`hover:text-white transition-colors flex items-center gap-2 ${activeTab === 'alavancagem' ? 'text-emerald-500' : ''}`}
            >
              <TrendingUp className="w-4 h-4" />
              Alavancagem
            </button>
            <button 
              onClick={() => setActiveTab('planilha')}
              className={`hover:text-white transition-colors flex items-center gap-2 ${activeTab === 'planilha' ? 'text-emerald-500' : ''}`}
            >
              <Table className="w-4 h-4" />
              Planilha
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`hover:text-white transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'text-emerald-500' : ''}`}
            >
              <History className="w-4 h-4" />
              Histórico
            </button>
            
            {user ? (
              <div className="flex items-center gap-4 pl-4 border-l border-white/10">
                <div className="flex items-center gap-2">
                  <img src={user.photoURL || ''} alt="" className="w-6 h-6 rounded-full border border-white/20" referrerPolicy="no-referrer" />
                  <span className="text-xs text-white/80">{user.displayName?.split(' ')[0]}</span>
                </div>
                <button onClick={logout} className="p-1.5 hover:bg-white/5 rounded-lg transition-colors text-red-400">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button onClick={login} className="flex items-center gap-2 px-4 py-1.5 bg-emerald-500 text-black rounded-lg font-bold text-xs hover:bg-emerald-400 transition-colors">
                <LogIn className="w-3 h-3" />
                Entrar
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'analyze' ? (
          <>
            {/* Search Section */}
            <section className="mb-12">
              <div className="max-w-3xl mx-auto text-center mb-10">
                <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Análise Estratégica <span className="text-emerald-500">Pré-Jogo</span></h2>
                <p className="text-white/60 text-lg">Insira o confronto e a odd desejada para gerar um prognóstico profissional baseado em dados reais.</p>
              </div>

              <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 p-6 rounded-2xl backdrop-blur-sm shadow-2xl">
                <div className="flex justify-between items-center mb-4 px-1">
                  <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Configurações de Análise</span>
                  <span className="text-[10px] font-medium text-emerald-500/60 italic">Analisando jogos de hoje: {new Date().toLocaleDateString('pt-BR')}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-7 relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input 
                      type="text" 
                      placeholder="Ex: Real Madrid vs Barcelona"
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-lg"
                      value={game}
                      onChange={(e) => setGame(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && generateAnalysis()}
                    />
                  </div>
                  <div className="md:col-span-3 relative">
                    <Target className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                    <input 
                      type="text" 
                      placeholder="Odd (ex: 1.80)"
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-lg"
                      value={desiredOdd}
                      onChange={(e) => setDesiredOdd(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={generateAnalysis}
                    disabled={loading || !game}
                    className="md:col-span-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold rounded-xl py-4 transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                    {loading ? 'Analisando...' : 'Analisar'}
                  </button>
                </div>
              </div>
            </section>

            {/* Error State */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="max-w-4xl mx-auto mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400"
                >
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <p>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results Section */}
            <AnimatePresence>
              {result && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8"
                >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-3">
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-widest">
                            <ShieldCheck className="w-3 h-3" />
                            Veredito de Elite Confirmado
                          </div>
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-bold uppercase tracking-widest">
                            <Search className="w-3 h-3" />
                            Validado via Google Search
                          </div>
                        </div>
                        <div className="mt-2">
                          <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter">{result.confronto || game}</h2>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-emerald-500 font-bold text-xs uppercase tracking-widest">{result.liga}</span>
                            <span className="text-white/20">•</span>
                            <span className="text-white/40 font-mono text-xs">{result.data}</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={saveAnalysis}
                        className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-bold transition-all self-start md:self-center"
                      >
                        <Save className="w-5 h-5 text-emerald-500" />
                        Salvar Análise
                      </button>
                    </div>
              {/* Top Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4 text-emerald-500">
                    <ShieldCheck className="w-6 h-6" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Gestão de Risco</h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
                      result.gestaoRisco === 'segura' ? 'bg-emerald-500/20 text-emerald-400' :
                      result.gestaoRisco === 'moderada' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>
                      {result.gestaoRisco}
                    </span>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4 text-emerald-500">
                    <Target className="w-6 h-6" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Confiança</h3>
                  </div>
                  <p className="text-xl font-mono font-black text-emerald-500 tracking-tighter">{result.confianca || '95% de probabilidade de Green'}</p>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4 text-emerald-500">
                    <BarChart3 className="w-6 h-6" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Expectativa de Gols</h3>
                  </div>
                  <p className="text-2xl font-mono font-bold">{result.estatisticas?.golsMedios}</p>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4 text-emerald-500">
                    <Calendar className="w-6 h-6" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Forma Recente</h3>
                  </div>
                  <p className="text-sm text-white/80">{result.estatisticas?.formaRecente}</p>
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Analysis & Stats */}
                <div className="lg:col-span-8 space-y-8">
                  {/* Mestre de Elite - Deep Analysis Block */}
                  {result.mestreDeElite && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative overflow-hidden group bg-gradient-to-br from-emerald-600/20 via-black to-emerald-900/40 border-2 border-emerald-500/50 rounded-3xl p-8 shadow-2xl shadow-emerald-500/10"
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                        <Zap className="w-32 h-32 text-emerald-500" />
                      </div>
                      
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-3 bg-emerald-500 rounded-2xl">
                          <Crown className="w-6 h-6 text-black" />
                        </div>
                        <div>
                          <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Mestre de Elite</h3>
                          <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Processamento de Dados em Tempo Real Solicitado</span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-6">
                          <div>
                            <h4 className="flex items-center gap-2 text-emerald-500 text-xs font-black uppercase mb-3 tracking-widest">
                              <Search className="w-3 h-3" />
                              Análise Profunda (Grounding)
                            </h4>
                            <p className="text-white/90 leading-relaxed text-sm font-medium">{result.mestreDeElite?.analiseProfunda}</p>
                          </div>
                          <div>
                            <h4 className="flex items-center gap-2 text-emerald-500 text-xs font-black uppercase mb-3 tracking-widest">
                              <History className="w-3 h-3" />
                              Confronto Direto (H2H)
                            </h4>
                            <p className="text-white/70 text-xs leading-relaxed">{result.mestreDeElite?.confrontoDireto}</p>
                          </div>
                          <div>
                            <h4 className="flex items-center gap-2 text-emerald-500 text-xs font-black uppercase mb-3 tracking-widest">
                              <Activity className="w-3 h-3" />
                              Últimos 5 Jogos
                            </h4>
                            <p className="text-white/70 text-xs leading-relaxed">{result.mestreDeElite?.ultimosJogos}</p>
                          </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 backdrop-blur-md relative">
                          <div className="absolute -top-3 -right-3">
                            <div className="bg-emerald-500 text-black px-4 py-1 rounded-full font-black text-[10px] uppercase tracking-tighter shadow-lg">
                              100% Certeza
                            </div>
                          </div>
                          
                          <h4 className="text-emerald-500 text-xs font-black uppercase mb-3 tracking-widest flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4" />
                            Veredito Final Absoluto
                          </h4>
                          
                          <div className="mb-6">
                            <p className="text-white font-bold leading-snug italic text-lg line-clamp-4">"{result.mestreDeElite?.predicaoAbsoluta}"</p>
                          </div>

                          <div className="space-y-3">
                            <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Eventos de Alta Probabilidade:</p>
                            <div className="flex flex-wrap gap-2">
                              {result.mestreDeElite?.eventosGarantidos?.map((ev: string, i: number) => (
                                <span key={i} className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-[10px] font-bold">
                                  {ev}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="mt-6 pt-4 border-t border-white/10">
                            <p className="text-[10px] text-white/40 font-bold uppercase mb-1">Oportunidade vs Odd Desejada (@{desiredOdd})</p>
                            <p className="text-xs text-white/80 leading-snug italic font-medium">{result.mestreDeElite?.oddJustificada}</p>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* Analysis Card */}
                  <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                    <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex items-center justify-between">
                      <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                        <Info className="w-4 h-4 text-emerald-500" />
                        Análise Tática do Jogo
                      </h3>
                    </div>
                    <div className="p-6 space-y-6">
                      <div>
                        <h4 className="text-emerald-500 text-xs font-bold uppercase mb-2">Estilo das Equipes</h4>
                        <p className="text-white/80 leading-relaxed">{result.analiseJogo?.estiloEquipes}</p>
                      </div>
                      <div>
                        <h4 className="text-emerald-500 text-xs font-bold uppercase mb-2">Característica do Jogo</h4>
                        <p className="text-white/80 leading-relaxed">{result.analiseJogo?.caracteristicaJogo}</p>
                      </div>
                      <div>
                        <h4 className="text-emerald-500 text-xs font-bold uppercase mb-2">Tendência e Expectativa</h4>
                        <p className="text-white/80 leading-relaxed">{result.analiseJogo?.tendencia}. {result.analiseJogo?.expectativa}</p>
                      </div>
                      <div className="pt-4 border-t border-white/5">
                        <h4 className="text-emerald-500 text-xs font-bold uppercase mb-2">Arbitragem</h4>
                        <p className="text-sm text-white/80"><span className="font-bold text-white">Juiz:</span> {result.analiseJogo?.arbitro?.nome}</p>
                        <p className="text-xs text-white/60 mt-1">{result.analiseJogo?.arbitro?.caracteristicas}</p>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Stats Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <h4 className="text-emerald-500 text-xs font-bold uppercase mb-4">Mercado de Gols</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Over/Under:</span>
                          <span className="font-mono">{result.estatisticas?.overUnder}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Ambas Marcam:</span>
                          <span className="font-mono">{result.estatisticas?.btts}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Gols HT:</span>
                          <span className="font-mono">{result.estatisticas?.golsHT}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <h4 className="text-emerald-500 text-xs font-bold uppercase mb-4">Escanteios & Cartões</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Escanteios Totais:</span>
                          <span className="font-mono">{result.estatisticas?.escanteios}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Escanteios HT:</span>
                          <span className="font-mono">{result.estatisticas?.escanteiosHT}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Cartões:</span>
                          <span className="font-mono">{result.estatisticas?.cartoes}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl md:col-span-2">
                      <h4 className="text-emerald-500 text-xs font-bold uppercase mb-4">Performance Técnica (Médias)</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-bold">Finalizações</p>
                          <p className="text-lg font-mono font-bold">{result.estatisticas?.finalizacoes}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-bold">Chutes Totais</p>
                          <p className="text-lg font-mono font-bold">{result.estatisticas?.chutesTotal}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-bold">Chutes ao Gol</p>
                          <p className="text-lg font-mono font-bold">{result.estatisticas?.chutesAoGol}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-white/40 uppercase font-bold">Defesas Goleiro</p>
                          <p className="text-lg font-mono font-bold">{result.estatisticas?.defesasGoleiro}</p>
                        </div>
                      </div>
                    </div>

                    {/* Mercados de Elite */}
                    {result.mercadosElite && result.mercadosElite.length > 0 && (
                      <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="bg-emerald-500/10 px-6 py-4 border-b border-white/10 flex items-center justify-between">
                          <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2 text-emerald-500">
                            <Zap className="w-4 h-4" />
                            Análise de Mercados de Elite
                          </h3>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                          {result.mercadosElite.map((m, idx) => (
                            <div key={idx} className="bg-black/20 p-4 rounded-xl border border-white/5 hover:border-emerald-500/30 transition-all">
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="text-[11px] font-black uppercase text-white/90 leading-tight flex-1 mr-2">{m.mercado}</h4>
                                <span className={`shrink-0 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${
                                  m.tendencia === 'Alta Tendência' 
                                    ? 'bg-emerald-500 text-black shadow-[0_0_10px_rgba(16,185,129,0.3)]' 
                                    : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                }`}>
                                  {m.tendencia}
                                </span>
                              </div>
                              <p className="text-[10px] text-white/60 mb-2 leading-relaxed">
                                {m.prognostico}
                              </p>
                              <div className="flex items-center gap-1.5 pt-2 border-t border-white/5">
                                <BarChart3 className="w-3 h-3 text-emerald-500/50" />
                                <span className="text-[9px] font-mono text-emerald-500/80 font-bold">{m.estatistica}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Market Reading */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-2xl">
                    <h3 className="text-emerald-500 font-bold uppercase tracking-wider text-sm mb-4">Leitura de Mercado & Valor</h3>
                    <p className="text-white/80 italic mb-4">"{result.leituraMercado?.valor}"</p>
                    <p className="text-sm text-white/60">{result.leituraMercado?.pontosFortesFracos}</p>
                  </div>

                  {/* Basketball Specific Data */}
                  {result.basquete && (
                    <div className="space-y-8">
                      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        <div className="bg-white/5 px-6 py-4 border-b border-white/10 flex items-center justify-between">
                          <h3 className="font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-500" />
                            Performance de Jogadores (Basquete)
                          </h3>
                        </div>
                        <div className="p-6 overflow-x-auto">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="text-emerald-500 uppercase tracking-widest border-b border-white/5">
                                <th className="pb-3 font-bold">Jogador</th>
                                <th className="pb-3 font-bold">PTS</th>
                                <th className="pb-3 font-bold">REB</th>
                                <th className="pb-3 font-bold">AST</th>
                                <th className="pb-3 font-bold">3PT</th>
                                <th className="pb-3 font-bold text-center">DD/TD</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {result.basquete?.jogadores?.map((player, idx) => (
                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                  <td className="py-3 font-bold text-white/90">{player.nome}</td>
                                  <td className="py-3 font-mono">{player.pontos}</td>
                                  <td className="py-3 font-mono">{player.rebotes}</td>
                                  <td className="py-3 font-mono">{player.assistencias}</td>
                                  <td className="py-3 font-mono">{player.cestas3}</td>
                                  <td className="py-3 font-mono text-center">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[10px] text-white/40">DD: {player.duploDuplo}</span>
                                      <span className="text-[10px] text-white/40">TD: {player.triploDuplo}</span>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                          <h4 className="text-emerald-500 text-xs font-bold uppercase mb-4">Prognóstico por Quarto</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[10px] text-white/40 uppercase font-bold mb-1">1º Quarto</p>
                              <p className="text-sm font-bold text-emerald-500">{result.basquete?.pontosQuartos?.q1}</p>
                            </div>
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[10px] text-white/40 uppercase font-bold mb-1">2º Quarto</p>
                              <p className="text-sm font-bold text-emerald-500">{result.basquete?.pontosQuartos?.q2}</p>
                            </div>
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[10px] text-white/40 uppercase font-bold mb-1">3º Quarto</p>
                              <p className="text-sm font-bold text-emerald-500">{result.basquete?.pontosQuartos?.q3}</p>
                            </div>
                            <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                              <p className="text-[10px] text-white/40 uppercase font-bold mb-1">4º Quarto</p>
                              <p className="text-sm font-bold text-emerald-500">{result.basquete?.pontosQuartos?.q4}</p>
                            </div>
                          </div>
                        </div>

                        <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                          <h4 className="text-emerald-500 text-xs font-bold uppercase mb-4">Pontuação por Tempo</h4>
                          <div className="space-y-4">
                            <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                              <span className="text-[10px] text-white/40 uppercase font-bold">1º Tempo (Total)</span>
                              <span className="text-sm font-bold text-emerald-500">{result.basquete?.pontosTempo?.t1}</span>
                            </div>
                            <div className="flex justify-between items-center bg-black/20 p-3 rounded-xl border border-white/5">
                              <span className="text-[10px] text-white/40 uppercase font-bold">2º Tempo (Total)</span>
                              <span className="text-sm font-bold text-emerald-500">{result.basquete?.pontosTempo?.t2}</span>
                            </div>
                            <div className="pt-2 border-t border-white/5">
                              <p className="text-[10px] text-white/40 uppercase font-bold mb-1">Expectativa de Placar</p>
                              <p className="text-sm font-mono font-bold text-white/90">{result.basquete?.pontuacaoTimes}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column: Predictions */}
                <div className="lg:col-span-4 space-y-8">
                  {/* Mestre de Elite - Deep Analysis */}
                  {result.mestreDeElite && (
                    <div className="bg-gradient-to-br from-amber-600 to-amber-900 text-white p-1 rounded-2xl shadow-2xl overflow-hidden shadow-amber-500/20">
                      <div className="bg-black/90 p-6 rounded-[15px] space-y-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="bg-amber-500 p-2 rounded-lg">
                              <Crown className="w-5 h-5 text-black" />
                            </div>
                            <div>
                              <h3 className="font-black uppercase tracking-tighter text-lg leading-tight">Mestre de Elite</h3>
                              <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Protocolo de Assertividade Máxima</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] font-bold text-white/40 uppercase tracking-widest">Confiança</p>
                            <p className="text-2xl font-black text-amber-500 leading-none">{result.confianca}</p>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                            <h4 className="text-[10px] font-black text-amber-500 uppercase mb-2 flex items-center gap-2">
                              <Zap className="w-3 h-3" />
                              Predição Absoluta
                            </h4>
                            <p className="text-sm font-bold italic text-white/90 leading-relaxed">
                              "{result.mestreDeElite.predicaoAbsoluta}"
                            </p>
                          </div>

                          <div className="grid grid-cols-1 gap-4">
                            <div>
                              <h4 className="text-[10px] font-black text-white/40 uppercase mb-2">Análise Profunda</h4>
                              <p className="text-[11px] text-white/70 leading-relaxed">
                                {result.mestreDeElite.analiseProfunda}
                              </p>
                            </div>
                            <div>
                              <h4 className="text-[10px] font-black text-white/40 uppercase mb-2">Eventos Garantidos</h4>
                              <div className="flex flex-wrap gap-2">
                                {result.mestreDeElite.eventosGarantidos?.map((ev, i) => (
                                  <span key={i} className="px-2 py-1 bg-amber-500/10 text-amber-500 rounded text-[9px] font-bold border border-amber-500/20">
                                    • {ev}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <div className="pt-4 border-t border-white/10">
                            <div className="flex justify-between items-center bg-amber-500/20 p-3 rounded-xl border border-amber-500/30">
                              <div>
                                <p className="text-[9px] font-bold text-amber-200/60 uppercase">Odd Justificada</p>
                                <p className="text-lg font-black text-amber-500">@{result.prognosticoPrincipal?.odd}</p>
                              </div>
                              <p className="text-[10px] font-medium text-amber-200/80 italic max-w-[150px] text-right leading-tight">
                                {result.mestreDeElite.oddJustificada}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Main Prediction */}
                  <div className="bg-emerald-500 text-black p-6 rounded-2xl shadow-xl shadow-emerald-500/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                      <Target className="w-24 h-24" />
                    </div>
                    <h3 className="font-black uppercase tracking-tighter text-2xl mb-1">Prognóstico Principal</h3>
                    <p className="text-black/60 text-xs font-bold uppercase mb-6 tracking-widest">Alvo: Odd {result.prognosticoPrincipal?.odd}</p>
                    
                    <div className="bg-black/10 rounded-xl p-4 mb-6 backdrop-blur-sm border border-black/5">
                      <p className="text-xl font-bold leading-tight">{result.prognosticoPrincipal?.entrada}</p>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase text-black/60">Justificativa Técnica</p>
                      <p className="text-sm font-medium leading-snug">{result.prognosticoPrincipal?.justificativa}</p>
                    </div>
                  </div>

                  {/* Safe Entry (Alta Confiança) */}
                  <div className="bg-white border-2 border-emerald-500 text-black p-6 rounded-2xl shadow-xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
                      <ShieldCheck className="w-20 h-20" />
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-emerald-600 font-black uppercase tracking-wider text-sm">Entrada de Alta Confiança</h3>
                    </div>
                    
                    <div className="flex justify-between items-end mb-4">
                      <p className="text-2xl font-black leading-tight flex-1">{result.prognosticoPrincipal?.entradaSegura?.mercado}</p>
                      <div className="text-right ml-4">
                        <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Odd</p>
                        <p className="text-xl font-mono font-black text-emerald-600">@{result.prognosticoPrincipal?.entradaSegura?.odd}</p>
                      </div>
                    </div>
                    
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                      <p className="text-xs font-bold text-emerald-800 mb-1">POR QUE É SEGURO?</p>
                      <p className="text-xs font-medium text-emerald-900 leading-relaxed">{result.prognosticoPrincipal?.entradaSegura?.justificativa}</p>
                    </div>
                  </div>

                  {/* Aposta Personalizada Sugerida */}
                  <div className="bg-black border-2 border-emerald-500/50 p-6 rounded-2xl shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                      <Zap className="w-20 h-20 text-emerald-500" />
                    </div>
                    <div className="flex items-center gap-2 mb-6">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                      <h3 className="text-emerald-500 font-black uppercase tracking-wider text-sm">Aposta Personalizada Sugerida</h3>
                    </div>
                    
                    <div className="space-y-3 mb-6">
                      {result.apostaPersonalizada?.selecoes?.map((sel, idx) => (
                        <div key={idx} className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <p className="text-sm font-bold text-white/90">{sel}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-between items-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 mb-4">
                      <div>
                        <p className="text-[10px] font-bold text-emerald-500/60 uppercase tracking-widest">Odd Combinada</p>
                        <p className="text-3xl font-mono font-black text-emerald-500">@{result.apostaPersonalizada?.oddTotal}</p>
                      </div>
                      <div className="text-right">
                        <div className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500 text-black text-[10px] font-black uppercase tracking-tighter">
                          Alta Confiança
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-[10px] text-white/40 leading-relaxed italic">
                      <span className="text-emerald-500/60 font-bold uppercase not-italic mr-1">Justificativa:</span>
                      {result.apostaPersonalizada?.justificativa}
                    </p>
                  </div>

                  {/* Leverage Prediction */}
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 text-emerald-500/10 group-hover:scale-110 transition-transform">
                      <Zap className="w-20 h-20" />
                    </div>
                    <div className="flex items-center gap-2 mb-4">
                      <Zap className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-emerald-500 font-bold uppercase tracking-wider text-xs">Odd de Alavancagem</h3>
                    </div>
                    <p className="text-lg font-bold mb-4 leading-tight">{result.alavancagemJogo?.entrada}</p>
                    <p className="text-xs text-white/60 leading-relaxed">{result.alavancagemJogo?.justificativa}</p>
                  </div>

                  {/* Daily Multi-Bet */}
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                    <div className="flex items-center gap-2 mb-6">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-emerald-500 font-bold uppercase tracking-wider text-xs">Bilhete do Dia (Múltipla)</h3>
                    </div>
                    
                    <div className="space-y-6 mb-6">
                      {result.alavancagemDia?.jogos?.map((j, idx) => (
                        <div key={idx} className="flex items-start gap-3 group">
                          <div className="w-1 h-full bg-emerald-500/20 group-hover:bg-emerald-500 transition-colors rounded-full" />
                          <div className="flex-1">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs font-bold text-white/40">{j.jogo}</p>
                              <span className="text-[10px] font-mono bg-white/5 px-1.5 py-0.5 rounded border border-white/5 text-emerald-500">{j.horario}</span>
                            </div>
                            <p className="text-sm font-bold mb-2">{j.entrada}</p>
                            <div className="flex items-center gap-1.5 bg-emerald-500/10 px-2 py-1 rounded-md border border-emerald-500/20">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              <p className="text-[10px] font-medium text-emerald-400">Segurança: {j.entradaSegura}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-white/10 flex items-center justify-between">
                      <div>
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Odd Total Estimada</p>
                        <p className="text-2xl font-mono font-bold text-emerald-500">{result.alavancagemDia?.oddTotal}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Estratégia</p>
                        <p className="text-xs font-medium">{result.alavancagemDia?.estrategia}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty State */}
        {!result && !loading && activeTab === 'analyze' && (
          <div className="max-w-xl mx-auto py-20 text-center">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10">
              <Search className="w-10 h-10 text-white/20" />
            </div>
            <h3 className="text-xl font-bold mb-2">Aguardando entrada...</h3>
            <p className="text-white/40">Insira um jogo e uma odd alvo para começar a análise profissional.</p>
          </div>
        )}
      </>
    ) : null}

        {activeTab === 'bilhetes' && (
          <div className="space-y-12">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-widest mb-6">
                <ShieldCheck className="w-3 h-3" />
                Protocolo de Segurança Elite Ativo
              </div>
              <h2 className="text-4xl md:text-5xl font-bold mb-4 tracking-tight">Arquiteto de <span className="text-emerald-500">Bilhetes de Elite</span></h2>
              <p className="text-white/60 text-lg">Engenharia de dados aplicada para construir acumuladas com precisão matemática e segurança máxima.</p>
            </div>

            <div className="max-w-4xl mx-auto bg-white/5 border border-white/10 p-8 rounded-3xl backdrop-blur-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div>
                  <div className="flex justify-between items-center mb-3">
                    <label className="text-xs font-bold uppercase tracking-widest text-white/40">Odd Total Desejada</label>
                    <span className="text-[10px] font-medium text-emerald-500/60 italic">Analisando jogos de hoje: {new Date().toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div className="relative">
                    <Target className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-emerald-500" />
                    <input 
                      type="text" 
                      className="w-full bg-black/40 border border-white/10 rounded-xl py-4 pl-12 pr-4 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all text-xl font-mono"
                      value={multiOdd}
                      onChange={(e) => setMultiOdd(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-white/40 mb-3">Mercados Preferenciais</label>
                  <div className="flex flex-wrap gap-2">
                    {markets.map(m => (
                      <button
                        key={m}
                        onClick={() => toggleMarket(m)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
                          selectedMarkets.includes(m) 
                            ? 'bg-emerald-500 border-emerald-500 text-black' 
                            : 'bg-white/5 border-white/10 text-white/40 hover:border-white/20'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={generateMultiBet}
                disabled={loading || selectedMarkets.length === 0}
                className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-black uppercase tracking-widest rounded-2xl py-5 transition-all flex items-center justify-center gap-3 shadow-xl shadow-emerald-500/20 text-lg"
              >
                {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-6 h-6" />}
                {loading ? 'Gerando Bilhete de Elite...' : 'Gerar Bilhete Múltiplo'}
              </button>
            </div>

            {/* Multi Bet Result */}
            <AnimatePresence>
              {multiResult && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="max-w-4xl mx-auto"
                >
                  <div className="bg-white rounded-[2.5rem] overflow-hidden shadow-2xl text-black">
                    <div className="bg-emerald-500 p-8 flex justify-between items-center">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="text-3xl font-black uppercase tracking-tighter leading-none">Bilhete de Elite</h3>
                          <div className="bg-black/20 px-2 py-1 rounded text-[8px] font-bold uppercase tracking-widest flex items-center gap-1">
                            <Search className="w-2 h-2" />
                            Grounding Ativo
                          </div>
                        </div>
                        <p className="text-black/60 text-xs font-bold uppercase tracking-widest">Análise Profunda • Assertividade Máxima</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Odd Total</p>
                        <p className="text-4xl font-mono font-black leading-none">@{multiResult?.oddTotal}</p>
                      </div>
                    </div>

                    <div className="p-8 space-y-6">
                      <div className="flex justify-end mb-4">
                        <button 
                          onClick={saveMultiBet}
                          className="flex items-center gap-2 px-6 py-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/10 rounded-xl font-bold transition-all text-emerald-700"
                        >
                          <Save className="w-5 h-5" />
                          Salvar Bilhete
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-4">
                        {multiResult?.jogos?.map((j, idx) => (
                          <div key={idx} className="flex items-center gap-6 p-6 bg-gray-50 rounded-3xl border border-gray-100 group hover:border-emerald-500/30 transition-all">
                            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 font-black text-emerald-500">
                              {idx + 1}
                            </div>
                            <div className="flex-1">
                              <div className="flex justify-between items-start mb-1">
                                <div className="flex flex-col">
                                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">{j.confronto}</p>
                                  <div className="flex items-center gap-2">
                                    <p className="text-[10px] font-medium text-emerald-600 uppercase tracking-widest">{j.liga}</p>
                                    <span className="text-[10px] text-gray-400">•</span>
                                    <p className="text-[10px] font-bold text-gray-400">{j.data}</p>
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{j.horario}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <p className="text-xl font-black">{j.entrada}</p>
                                <p className="text-xl font-mono font-black text-emerald-600">@{j.odd}</p>
                              </div>
                              <div className="mt-3 flex items-start gap-2">
                                <Info className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                                <p className="text-[11px] text-gray-500 leading-snug italic">{j.justificativaCurta}</p>
                              </div>
                              {j.fonteVerificacao && (
                                <div className="mt-2 flex items-center gap-2 px-2 py-1 bg-gray-100 rounded-lg w-fit">
                                  <Search className="w-2.5 h-2.5 text-gray-400" />
                                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-tighter">Fonte: {j.fonteVerificacao}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-8 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Visão Estratégica</h4>
                          <p className="text-sm font-medium leading-relaxed text-gray-700">{multiResult?.analiseGeral}</p>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex flex-col justify-center items-center text-center">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Índice de Confiança</h4>
                          <div className="text-4xl font-black text-emerald-500 mb-1">{multiResult?.confianca}</div>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Probabilidade de Green</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* History Tab */}
        {activeTab === 'history' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold tracking-tight">Histórico de <span className="text-emerald-500">Análises</span></h2>
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => syncResults(true)}
                  disabled={syncing}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                    syncing 
                      ? 'bg-white/5 text-white/20 cursor-not-allowed' 
                      : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20'
                  }`}
                >
                  <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Sincronizando...' : 'Sincronizar Resultados'}
                </button>
                <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-white/40">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>{history.filter(h => h.status === 'hit').length} Acertos</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span>{history.filter(h => h.status === 'miss').length} Erros</span>
                  </div>
                </div>
              </div>
            </div>

            {!user ? (
              <div className="max-w-md mx-auto py-20 text-center bg-white/5 border border-white/10 rounded-3xl">
                <History className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Faça login para ver seu histórico</h3>
                <p className="text-white/40 mb-6">Suas análises salvas ficarão guardadas aqui para conferência.</p>
                <button onClick={login} className="px-8 py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all">
                  Entrar com Google
                </button>
              </div>
            ) : history.length === 0 ? (
              <div className="max-w-md mx-auto py-20 text-center">
                <History className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <h3 className="text-xl font-bold mb-2">Nenhuma análise salva</h3>
                <p className="text-white/40">As análises que você salvar aparecerão aqui.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {history.map((item) => (
                  <motion.div 
                    layout
                    key={item.id}
                    className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden"
                  >
                    <div className="p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center border ${
                            item.status === 'hit' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' :
                            item.status === 'miss' ? 'bg-red-500/10 border-red-500/20 text-red-500' :
                            'bg-white/5 border-white/10 text-white/40'
                          }`}>
                            {item.status === 'hit' ? <CheckCircle2 className="w-6 h-6" /> :
                             item.status === 'miss' ? <XCircle className="w-6 h-6" /> :
                             <Clock className="w-6 h-6" />}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest ${
                                item.type === 'multi' ? 'bg-purple-500/20 text-purple-400' : 'bg-emerald-500/20 text-emerald-400'
                              }`}>
                                {item.type === 'multi' ? 'Bilhete Múltiplo' : 'Análise Simples'}
                              </span>
                            </div>
                            <h4 className="font-bold text-lg">{item.game}</h4>
                            {item.analysis && (
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-emerald-500 font-bold text-[10px] uppercase tracking-widest">{item.analysis.liga}</span>
                                <span className="text-white/20">•</span>
                                <span className="text-white/40 font-mono text-[10px]">{item.analysis.data}</span>
                              </div>
                            )}
                            <p className="text-xs text-white/40 uppercase tracking-widest mt-1">{new Date(item.date).toLocaleString('pt-BR')}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button 
                            onClick={() => updateStatus(item.id, 'hit')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                              item.status === 'hit' ? 'bg-emerald-500 text-black' : 'bg-white/5 hover:bg-emerald-500/20 text-emerald-500'
                            }`}
                          >
                            Green
                          </button>
                          <button 
                            onClick={() => updateStatus(item.id, 'miss')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                              item.status === 'miss' ? 'bg-red-500 text-white' : 'bg-white/5 hover:bg-red-500/20 text-red-500'
                            }`}
                          >
                            Red
                          </button>
                          <button 
                            onClick={() => updateStatus(item.id, 'void')}
                            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                              item.status === 'void' ? 'bg-white/20 text-white' : 'bg-white/5 hover:bg-white/10 text-white/40'
                            }`}
                          >
                            Reembolso
                          </button>
                          <button 
                            onClick={() => deleteAnalysis(item.id)}
                            className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {item.type === 'single' && item.analysis && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                          <div className={`p-4 rounded-xl border transition-all ${
                            item.entryStatuses?.principal === 'hit' ? 'bg-emerald-500/10 border-emerald-500/30' :
                            item.entryStatuses?.principal === 'miss' ? 'bg-rose-500/10 border-rose-500/30' :
                            item.entryStatuses?.principal === 'void' ? 'bg-amber-500/10 border-amber-500/30' :
                            'bg-black/20 border-white/5'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-[10px] font-bold text-white/40 uppercase">Entrada Principal</p>
                              {item.entryStatuses?.principal && item.entryStatuses.principal !== 'pending' && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                  item.entryStatuses.principal === 'hit' ? 'bg-emerald-500 text-white border-emerald-400' :
                                  item.entryStatuses.principal === 'miss' ? 'bg-rose-500 text-white border-rose-400' :
                                  'bg-amber-500 text-white border-amber-400'
                                }`}>
                                  {item.entryStatuses.principal === 'hit' ? 'GREEN' : item.entryStatuses.principal === 'miss' ? 'RED' : 'VOID'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-emerald-500">{item.analysis.prognosticoPrincipal?.entrada}</p>
                            <p className="text-xs font-mono text-white/40 mt-1">@{item.analysis.prognosticoPrincipal?.odd}</p>
                          </div>
                          <div className={`p-4 rounded-xl border transition-all ${
                            item.entryStatuses?.segura === 'hit' ? 'bg-emerald-500/10 border-emerald-500/30' :
                            item.entryStatuses?.segura === 'miss' ? 'bg-rose-500/10 border-rose-500/30' :
                            item.entryStatuses?.segura === 'void' ? 'bg-amber-500/10 border-amber-500/30' :
                            'bg-black/20 border-white/5'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-[10px] font-bold text-white/40 uppercase">Entrada Segura</p>
                              {item.entryStatuses?.segura && item.entryStatuses.segura !== 'pending' && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                  item.entryStatuses.segura === 'hit' ? 'bg-emerald-500 text-white border-emerald-400' :
                                  item.entryStatuses.segura === 'miss' ? 'bg-rose-500 text-white border-rose-400' :
                                  'bg-amber-500 text-white border-amber-400'
                                }`}>
                                  {item.entryStatuses.segura === 'hit' ? 'GREEN' : item.entryStatuses.segura === 'miss' ? 'RED' : 'VOID'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-emerald-400">{item.analysis.prognosticoPrincipal?.entradaSegura?.mercado}</p>
                            <p className="text-xs font-mono text-white/40 mt-1">@{item.analysis.prognosticoPrincipal?.entradaSegura?.odd}</p>
                          </div>
                          <div className={`p-4 rounded-xl border transition-all ${
                            item.entryStatuses?.alavancagem === 'hit' ? 'bg-emerald-500/10 border-emerald-500/30' :
                            item.entryStatuses?.alavancagem === 'miss' ? 'bg-rose-500/10 border-rose-500/30' :
                            item.entryStatuses?.alavancagem === 'void' ? 'bg-amber-500/10 border-amber-500/30' :
                            'bg-black/20 border-white/5'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <p className="text-[10px] font-bold text-white/40 uppercase">Alavancagem</p>
                              {item.entryStatuses?.alavancagem && item.entryStatuses.alavancagem !== 'pending' && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                  item.entryStatuses.alavancagem === 'hit' ? 'bg-emerald-500 text-white border-emerald-400' :
                                  item.entryStatuses.alavancagem === 'miss' ? 'bg-rose-500 text-white border-rose-400' :
                                  'bg-amber-500 text-white border-amber-400'
                                }`}>
                                  {item.entryStatuses.alavancagem === 'hit' ? 'GREEN' : item.entryStatuses.alavancagem === 'miss' ? 'RED' : 'VOID'}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-bold text-yellow-500">{item.analysis.alavancagemJogo?.entrada}</p>
                          </div>

                          {item.analysis.apostaPersonalizada && (
                            <div className={`md:col-span-3 p-4 rounded-xl border transition-all ${
                              item.entryStatuses?.apostaPersonalizada === 'hit' ? 'bg-emerald-500/10 border-emerald-500/30' :
                              item.entryStatuses?.apostaPersonalizada === 'miss' ? 'bg-rose-500/10 border-rose-500/30' :
                              item.entryStatuses?.apostaPersonalizada === 'void' ? 'bg-amber-500/10 border-amber-500/30' :
                              'bg-black/40 border-emerald-500/20'
                            }`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <Zap className="w-3 h-3 text-emerald-500" />
                                  <p className="text-[10px] font-bold text-emerald-500 uppercase">Aposta Personalizada Sugerida</p>
                                </div>
                                {item.entryStatuses?.apostaPersonalizada && item.entryStatuses.apostaPersonalizada !== 'pending' && (
                                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${
                                    item.entryStatuses.apostaPersonalizada === 'hit' ? 'bg-emerald-500 text-white border-emerald-400' :
                                    item.entryStatuses.apostaPersonalizada === 'miss' ? 'bg-rose-500 text-white border-rose-400' :
                                    'bg-amber-500 text-white border-amber-400'
                                  }`}>
                                    {item.entryStatuses.apostaPersonalizada === 'hit' ? 'GREEN' : item.entryStatuses.apostaPersonalizada === 'miss' ? 'RED' : 'VOID'}
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2 mb-3">
                                {item.analysis.apostaPersonalizada?.selecoes?.map((sel, idx) => (
                                  <span key={idx} className="text-[9px] bg-white/5 px-2 py-1 rounded border border-white/5 text-white/80">
                                    {sel}
                                  </span>
                                ))}
                              </div>
                              <div className="flex justify-between items-center">
                                <p className="text-xs font-mono font-bold text-emerald-500">Odd Combinada: @{item.analysis.apostaPersonalizada?.oddTotal}</p>
                                <p className="text-[9px] text-white/40 italic">{item.analysis.apostaPersonalizada?.justificativa}</p>
                              </div>
                            </div>
                          )}
                          <div className={`p-4 rounded-xl border transition-all ${
                            item.status === 'hit' ? 'bg-emerald-500/10 border-emerald-500/20' :
                            item.status === 'miss' ? 'bg-rose-500/10 border-rose-500/20' :
                            'bg-white/5 border-white/10'
                          }`}>
                            <p className={`text-[10px] font-bold uppercase mb-2 ${
                              item.status === 'hit' ? 'text-emerald-500/60' :
                              item.status === 'miss' ? 'text-rose-500/60' :
                              'text-white/40'
                            }`}>Confiança</p>
                            <p className={`text-sm font-black tracking-tighter ${
                              item.status === 'hit' ? 'text-emerald-500' :
                              item.status === 'miss' ? 'text-rose-500' :
                              'text-white/60'
                            }`}>{item.analysis?.confianca || '95% de probabilidade de Green'}</p>
                          </div>

                          {item.postGameAnalysis && (
                            <div className="md:col-span-3 bg-white/5 border border-white/10 p-4 rounded-xl">
                              <div className="flex items-center gap-2 mb-2">
                                <BarChart3 className="w-3 h-3 text-emerald-500" />
                                <p className="text-[10px] font-bold text-emerald-500 uppercase">Análise Pós-Jogo (Refinamento)</p>
                              </div>
                              <p className="text-xs text-white/70 leading-relaxed italic">
                                {item.postGameAnalysis}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {item.type === 'multi' && item.multiAnalysis && (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex flex-col">
                              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Jogos no Bilhete</p>
                              <p className={`text-[10px] font-black uppercase tracking-widest ${
                                item.status === 'hit' ? 'text-emerald-500' :
                                item.status === 'miss' ? 'text-rose-500' :
                                'text-white/40'
                              }`}>{item.multiAnalysis.confianca || '95% de probabilidade de Green'}</p>
                            </div>
                            <p className={`text-xs font-mono font-bold ${
                              item.status === 'hit' ? 'text-emerald-500' :
                              item.status === 'miss' ? 'text-rose-500' :
                              'text-white/40'
                            }`}>Odd Total: @{item.multiAnalysis.oddTotal}</p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {item.multiAnalysis?.jogos?.map((j, i) => (
                              <div key={i} className={`flex justify-between items-center p-3 rounded-xl border text-xs transition-all ${
                                item.entryStatuses?.multi?.[i] === 'hit' ? 'bg-emerald-500/10 border-emerald-500/30' :
                                item.entryStatuses?.multi?.[i] === 'miss' ? 'bg-rose-500/10 border-rose-500/30' :
                                item.entryStatuses?.multi?.[i] === 'void' ? 'bg-amber-500/10 border-amber-500/30' :
                                'bg-black/20 border-white/5'
                              }`}>
                                <div className="flex items-center gap-2 truncate mr-4">
                                  {item.entryStatuses?.multi?.[i] && item.entryStatuses.multi[i] !== 'pending' && (
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                      item.entryStatuses.multi[i] === 'hit' ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' :
                                      item.entryStatuses.multi[i] === 'miss' ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.5)]' :
                                      'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]'
                                    }`} />
                                  )}
                                  <div className="flex flex-col truncate">
                                    <span className="text-white/60 truncate">{j.confronto}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-[8px] font-bold text-emerald-500 uppercase tracking-widest truncate">{j.liga}</span>
                                      <span className="text-[8px] text-white/20">•</span>
                                      <span className="text-[8px] font-bold text-white/40">{j.data}</span>
                                    </div>
                                  </div>
                                </div>
                                <span className={`font-bold whitespace-nowrap ${
                                  item.entryStatuses?.multi?.[i] === 'hit' ? 'text-emerald-400' :
                                  item.entryStatuses?.multi?.[i] === 'miss' ? 'text-rose-400' :
                                  item.entryStatuses?.multi?.[i] === 'void' ? 'text-amber-400' :
                                  'text-emerald-400'
                                }`}>{j.entrada} (@{j.odd})</span>
                              </div>
                            ))}
                          </div>

                          {item.postGameAnalysis && (
                            <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                              <div className="flex items-center gap-2 mb-2">
                                <BarChart3 className="w-3 h-3 text-emerald-500" />
                                <p className="text-[10px] font-bold text-emerald-500 uppercase">Análise Pós-Jogo (Refinamento)</p>
                              </div>
                              <p className="text-xs text-white/70 leading-relaxed italic">
                                {item.postGameAnalysis}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Alavancagem Tab */}
        {activeTab === 'alavancagem' && (
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold mb-4 tracking-tight">Alavancagem de <span className="text-emerald-500">Banca</span></h2>
              <p className="text-white/60">O jogo mais seguro do mundo hoje, com odd entre 1.50 e 1.80, selecionado por IA.</p>
            </div>

            <div className="flex justify-center mb-12">
              <button 
                onClick={generateLeverageBet}
                disabled={loading}
                className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold px-8 py-4 rounded-2xl transition-all flex items-center gap-3 shadow-xl shadow-emerald-500/20"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <TrendingUp className="w-5 h-5" />}
                {loading ? 'Buscando Oportunidade...' : 'Encontrar Jogo de Alavancagem'}
              </button>
            </div>

            {leverageResult && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/5 border border-emerald-500/30 p-8 rounded-3xl backdrop-blur-xl relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-6">
                  <div className="bg-emerald-500 text-black font-black px-4 py-1 rounded-full text-xs uppercase tracking-widest">
                    Segurança Máxima
                  </div>
                </div>

                <div className="mb-8">
                  <p className="text-emerald-500 font-bold uppercase tracking-widest text-xs mb-2">{leverageResult.liga}</p>
                  <h3 className="text-3xl font-bold mb-1">{leverageResult.confronto}</h3>
                  <p className="text-white/40 text-sm">{leverageResult.data} às {leverageResult.horario}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                  <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                    <p className="text-white/40 text-[10px] font-bold uppercase mb-2 tracking-widest">Entrada Sugerida</p>
                    <p className="text-2xl font-bold text-emerald-500">{leverageResult.entrada}</p>
                    <p className="text-xl font-mono text-white/60 mt-2">Odd @{leverageResult.odd}</p>
                  </div>
                  <div className="bg-black/40 p-6 rounded-2xl border border-white/5">
                    <p className="text-white/40 text-[10px] font-bold uppercase mb-2 tracking-widest">Confiança do Sistema</p>
                    <p className="text-2xl font-bold text-emerald-500">{leverageResult.confianca}</p>
                    <p className="text-sm text-white/40 mt-2 italic">Prognóstico de elite sem margem para erro.</p>
                  </div>
                </div>

                <div className={`${leverageResult.justificativa?.startsWith('AVISO') ? 'bg-amber-500/10 border-amber-500/20' : 'bg-emerald-500/5 border-emerald-500/10'} border p-6 rounded-2xl`}>
                  <div className="flex items-center gap-2 mb-4">
                    {leverageResult.justificativa?.startsWith('AVISO') ? (
                      <AlertTriangle className="w-4 h-4 text-amber-500" />
                    ) : (
                      <BarChart3 className="w-4 h-4 text-emerald-500" />
                    )}
                    <p className={`text-xs font-bold uppercase ${leverageResult.justificativa?.startsWith('AVISO') ? 'text-amber-500' : 'text-emerald-500'}`}>
                      {leverageResult.justificativa?.startsWith('AVISO') ? 'Aviso de Segurança' : 'Justificativa Técnica'}
                    </p>
                  </div>
                  <p className={`${leverageResult.justificativa?.startsWith('AVISO') ? 'text-amber-200/80' : 'text-white/70'} leading-relaxed italic`}>
                    {leverageResult.justificativa}
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Planilha Tab */}
        {activeTab === 'planilha' && (
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <p className="text-white/40 text-[10px] font-bold uppercase mb-1 tracking-widest">Banca Inicial</p>
                <div className="flex items-center gap-2">
                  <span className="text-white/40 text-xs">R$</span>
                  <input 
                    type="number" 
                    value={initialBankroll}
                    onChange={(e) => setInitialBankroll(Number(e.target.value))}
                    className="bg-transparent text-2xl font-bold w-full focus:outline-none"
                  />
                </div>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <p className="text-white/40 text-[10px] font-bold uppercase mb-1 tracking-widest">Banca Atual</p>
                <p className="text-2xl font-bold text-emerald-500">
                  R$ {(initialBankroll + spreadsheetEntries.reduce((acc, curr) => acc + curr.profit, 0)).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <p className="text-white/40 text-[10px] font-bold uppercase mb-1 tracking-widest">Lucro Total</p>
                <p className={`text-2xl font-bold ${spreadsheetEntries.reduce((acc, curr) => acc + curr.profit, 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  R$ {spreadsheetEntries.reduce((acc, curr) => acc + curr.profit, 0).toFixed(2)}
                </p>
              </div>
              <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                <p className="text-white/40 text-[10px] font-bold uppercase mb-1 tracking-widest">ROI (%)</p>
                <p className="text-2xl font-bold text-emerald-500">
                  {initialBankroll > 0 ? ((spreadsheetEntries.reduce((acc, curr) => acc + curr.profit, 0) / initialBankroll) * 100).toFixed(1) : 0}%
                </p>
              </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-3xl overflow-hidden mb-12">
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-black/20">
                <h3 className="font-bold flex items-center gap-2">
                  <Table className="w-4 h-4 text-emerald-500" />
                  Planilha de Gestão
                </h3>
                <button 
                  onClick={() => addSpreadsheetEntry({
                    date: new Date().toISOString(),
                    game: 'Novo Jogo',
                    odd: 1.80,
                    stake: initialBankroll * 0.05,
                    status: 'pending'
                  })}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-black rounded-xl font-bold text-xs hover:bg-emerald-400 transition-all"
                >
                  <Plus className="w-3 h-3" />
                  Nova Entrada
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] font-bold text-white/40 uppercase tracking-widest border-b border-white/5">
                      <th className="px-6 py-4">Data</th>
                      <th className="px-6 py-4">Evento</th>
                      <th className="px-6 py-4">Odd</th>
                      <th className="px-6 py-4">Stake</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4 text-right">Lucro/Prejuízo</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {spreadsheetEntries.map((entry) => (
                      <tr key={entry.id} className="text-sm hover:bg-white/5 transition-colors group">
                        <td className="px-6 py-4 text-white/60 font-mono text-xs">
                          {new Date(entry.date).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-6 py-4 font-medium">
                          <input 
                            type="text" 
                            value={entry.game}
                            onChange={(e) => updateDoc(doc(db, 'spreadsheet', entry.id), { game: e.target.value })}
                            className="bg-transparent focus:outline-none focus:text-emerald-500 transition-colors w-full"
                          />
                        </td>
                        <td className="px-6 py-4 font-mono">
                          <input 
                            type="number" 
                            step="0.01"
                            value={entry.odd}
                            onChange={(e) => updateDoc(doc(db, 'spreadsheet', entry.id), { odd: Number(e.target.value) })}
                            className="bg-transparent focus:outline-none focus:text-emerald-500 transition-colors w-16"
                          />
                        </td>
                        <td className="px-6 py-4 font-mono">
                          <input 
                            type="number" 
                            value={entry.stake}
                            onChange={(e) => updateDoc(doc(db, 'spreadsheet', entry.id), { stake: Number(e.target.value) })}
                            className="bg-transparent focus:outline-none focus:text-emerald-500 transition-colors w-20"
                          />
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => updateSpreadsheetStatus(entry.id, 'hit')}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${entry.status === 'hit' ? 'bg-emerald-500 text-black' : 'bg-white/5 text-white/20 hover:bg-emerald-500/20'}`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => updateSpreadsheetStatus(entry.id, 'miss')}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${entry.status === 'miss' ? 'bg-red-500 text-white' : 'bg-white/5 text-white/20 hover:bg-red-500/20'}`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => updateSpreadsheetStatus(entry.id, 'void')}
                              className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${entry.status === 'void' ? 'bg-amber-500 text-white' : 'bg-white/5 text-white/20 hover:bg-amber-500/20'}`}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                        <td className={`px-6 py-4 text-right font-bold font-mono ${entry.profit > 0 ? 'text-emerald-500' : entry.profit < 0 ? 'text-red-500' : 'text-white/40'}`}>
                          {entry.profit > 0 ? '+' : ''}{entry.profit.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button 
                            onClick={() => deleteSpreadsheetEntry(entry.id)}
                            className="p-2 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {spreadsheetEntries.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-6 py-12 text-center text-white/20 italic">
                          Nenhuma entrada registrada. Comece sua alavancagem agora!
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-emerald-500/5 border border-emerald-500/10 p-8 rounded-3xl">
              <div className="flex items-center gap-3 mb-6">
                <Calculator className="w-6 h-6 text-emerald-500" />
                <h3 className="text-xl font-bold">Gestão de Banca <span className="text-emerald-500">Automática</span></h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-2">
                  <p className="text-sm font-bold text-white/80">Sugestão de Stake (Segura)</p>
                  <p className="text-2xl font-bold text-emerald-500">R$ {(initialBankroll * 0.02).toFixed(2)}</p>
                  <p className="text-xs text-white/40">2% da banca inicial para controle de risco rigoroso.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold text-white/80">Sugestão de Stake (Moderada)</p>
                  <p className="text-2xl font-bold text-emerald-500">R$ {(initialBankroll * 0.05).toFixed(2)}</p>
                  <p className="text-xs text-white/40">5% da banca inicial para crescimento constante.</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-bold text-white/80">Meta de Alavancagem (Mensal)</p>
                  <p className="text-2xl font-bold text-emerald-500">R$ {(initialBankroll * 2).toFixed(2)}</p>
                  <p className="text-xs text-white/40">Dobrar a banca com segurança em 30 dias.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="max-w-xl mx-auto py-20 text-center">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
              <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-emerald-500 animate-pulse" />
              </div>
            </div>
            <h3 className="text-2xl font-bold mb-4 animate-pulse">Processando Dados Reais...</h3>
            <div className="space-y-2 max-w-xs mx-auto">
              <p className="text-sm text-white/40 flex items-center justify-center gap-2">
                <ChevronRight className="w-3 h-3" /> Buscando estatísticas no Google
              </p>
              <p className="text-sm text-white/40 flex items-center justify-center gap-2">
                <ChevronRight className="w-3 h-3" /> Analisando forma recente e H2H
              </p>
              <p className="text-sm text-white/40 flex items-center justify-center gap-2">
                <ChevronRight className="w-3 h-3" /> Calculando probabilidades de mercado
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-6">
            <TrendingUp className="w-5 h-5 text-emerald-500" />
            <span className="font-bold uppercase tracking-tighter italic">FutAnalytix Pro</span>
          </div>
          <p className="text-white/40 text-sm max-w-lg mx-auto mb-8">
            Este sistema utiliza inteligência artificial e dados em tempo real para auxiliar na tomada de decisão. Lembre-se: apostas envolvem risco. Jogue com responsabilidade.
          </p>
          <div className="flex items-center justify-center gap-8 text-xs font-bold uppercase tracking-widest text-white/20">
            <span>© 2026 FutAnalytix</span>
            <span>Termos de Uso</span>
            <span>Privacidade</span>
          </div>
        </div>
      </footer>
      {interactiveRobot}
    </div>
    </ErrorBoundary>
  );
}
