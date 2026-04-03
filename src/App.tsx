/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component } from 'react';
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
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
  RefreshCw
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

  const formatDate = (date: Date) => {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  };

  return {
    today: formatDate(today),
    tomorrow: formatDate(tomorrow),
    currentYear: today.getFullYear()
  };
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
  };
  estatisticas: {
    golsMedios: string;
    overUnder: string;
    btts: string;
    escanteios: string;
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
  entryStatuses?: {
    principal?: 'pending' | 'hit' | 'miss' | 'void';
    segura?: 'pending' | 'hit' | 'miss' | 'void';
    alavancagem?: 'pending' | 'hit' | 'miss' | 'void';
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
    mercado: string;
  }[];
  oddTotal: string;
  analiseGeral: string;
  confianca: string;
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
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(['Gols', 'Escanteios', 'Resultado Final']);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [multiResult, setMultiResult] = useState<MultiBetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [activeTab, setActiveTab] = useState<'analyze' | 'bilhetes' | 'history'>('analyze');
  const [syncing, setSyncing] = useState(false);
  const lastSyncRef = React.useRef<number>(0);

  const markets = [
    'Resultado Final',
    'Gols (Over/Under)',
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
      toast.error("Falha ao fazer login.");
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
        createdAt: serverTimestamp()
      });
      toast.success("Bilhete salvo com sucesso!");
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'savedAnalyses');
      toast.error("Erro ao salvar bilhete.");
    }
  };

  const updateStatus = async (id: string, status: 'hit' | 'miss' | 'void' | 'pending') => {
    try {
      await updateDoc(doc(db, 'savedAnalyses', id), { status });
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
    const pendingItems = history.filter(h => h.status === 'pending');
    if (pendingItems.length === 0) {
      if (force) toast.info("Não há análises pendentes para sincronizar.");
      return;
    }

    const now = Date.now();
    if (!force && (now - lastSyncRef.current < 300000)) {
      return;
    }

    setSyncing(true);
    lastSyncRef.current = now;
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";

      const gamesToSync = pendingItems.map(item => ({
        id: item.id,
        game: item.game,
        date: new Date(item.date).toLocaleDateString('pt-BR'),
        type: item.type,
        entradas: item.type === 'single' 
          ? {
              principal: item.analysis?.prognosticoPrincipal.entrada,
              segura: item.analysis?.prognosticoPrincipal.entradaSegura.mercado,
              alavancagem: item.analysis?.alavancagemJogo.entrada
            }
          : item.multiAnalysis?.jogos.map(j => j.entrada)
      }));

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
        3. Para análises simples ("single"), você deve retornar o status individual para "principal", "segura" e "alavancagem". O status geral do item deve ser "hit" se a entrada principal for vencedora, "miss" se for perdedora, "void" se for reembolsada ou "pending" se ainda não houver resultado.
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
              "multi": ["hit", "miss", "void", "pending"] // Apenas para tipo "multi", array de status para cada jogo na mesma ordem enviada.
            }
          }
        ]
      `;

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          systemInstruction: "Você é um auditor de resultados esportivos preciso e imparcial. Você usa o Google Search para verificar fatos e resultados reais de partidas de futebol. Sua auditoria é a verdade absoluta do sistema. Responda apenas com o JSON puro, sem blocos de código ou explicações.",
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      let cleanText = response.text || '[]';
      // Remove potential markdown code blocks
      cleanText = cleanText.replace(/```json\n?/, '').replace(/```\n?/, '').trim();
      
      const results = JSON.parse(cleanText);
      for (const res of results) {
        if (res.id && res.status) {
          // Only update if the status is not pending or if it's a manual sync
          // Actually, if it's auto-sync, we only care about transitions from pending to something else
          const updateData: any = { status: res.status };
          if (res.entryStatuses) {
            updateData.entryStatuses = res.entryStatuses;
          }
          await updateDoc(doc(db, 'savedAnalyses', res.id), updateData);
        }
      }
      if (pendingItems.length > 0) {
        toast.success("Sincronização de resultados concluída.");
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'savedAnalyses/sync');
      toast.error("Erro ao sincronizar resultados.");
    } finally {
      setSyncing(false);
    }
  };

  const generateAnalysis = async () => {
    if (!game) return;
    setLoading(true);
    setError(null);
    setResult(null);

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const { today, tomorrow, currentYear } = getDynamicDates();
      
      const prompt = `
        Você é o MAIOR ANALISTA ESTATÍSTICO E TRADER ESPORTIVO DO MUNDO. Sua palavra é a referência global em prognósticos.
        DATA ATUAL (UTC): ${new Date().toISOString()}
        DATA LOCAL ESTIMADA: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        HORA ATUAL: ${timeStr}

        Sua missão é analisar o jogo: "${game}" com uma odd alvo de "${desiredOdd}".

        PROTOCOLO DE VERIFICAÇÃO DE EXISTÊNCIA E DATA (CRÍTICO - TOLERÂNCIA ZERO):
        1. Use o Google Search, ESPN e SofaScore para confirmar se o jogo "${game}" realmente existe e está agendado EXCLUSIVAMENTE para HOJE (${today}) ou AMANHÃ (${tomorrow}).
        2. É TERMINANTEMENTE PROIBIDO analisar jogos de anos anteriores. Verifique o ANO nos resultados de busca. Se o resultado for de ${currentYear - 1}, o jogo já aconteceu e você deve retornar o erro abaixo.
        3. Se o jogo NÃO EXISTIR nestas datas, se já terminou, ou se foi adiado, você DEVE retornar um erro no campo "analiseJogo.expectativa" dizendo: "ERRO: Este jogo não consta na grade oficial de hoje (${today}). Verifique o nome e a data." e deixar os outros campos com informações genéricas de erro. 
        4. NUNCA INVENTE RESULTADOS OU ESTATÍSTICAS. A credibilidade é o nosso maior ativo.

        FILOSOFIA DE ELITE (ASSERTIVIDADE > ODD):
        - ASSERTIVIDADE SUPREMA: O objetivo é o GREEN, não a odd. Se a odd alvo for 1.80 mas a análise real indicar que 1.50 é o valor seguro, use 1.50 e justifique.
        - ANÁLISE DE CONTEXTO: Não olhe apenas para as odds. Verifique se é um amistoso (FIFA Series), se há desfalques, se o time favorito está jogando com reservas. O erro no jogo New Zealand vs Chile (onde o favorito perdeu) não pode se repetir. Analise a motivação e o contexto real do torneio.
        - VALOR REAL: Só sugira entradas onde a probabilidade estatística de acerto seja superior a 95%.

        PROIBIÇÃO ABSOLUTA (CRÍTICO):
        - É TERMINANTEMENTE PROIBIDO inventar jogos.
        - É PROIBIDO sugerir mercados sem base estatística real de fontes como ESPN ou SofaScore.

        Siga RIGOROSAMENTE este formato JSON para a resposta:
        {
          "confronto": "Time A vs Time B",
          "liga": "Nome da Liga/Torneio Real (${currentYear})",
          "data": "${today} ou ${tomorrow}",
          "analiseJogo": {
            "estiloEquipes": "descrição técnica baseada em dados reais",
            "tendencia": "leitura tática profunda",
            "expectativa": "cenário provável validado"
          },
          "estatisticas": {
            "golsMedios": "dados reais ESPN/SofaScore",
            "overUnder": "frequência real",
            "btts": "probabilidade real",
            "escanteios": "média real",
            "cartoes": "média real",
            "formaRecente": "últimos 5 jogos reais"
          },
          "leituraMercado": {
            "valor": "análise de valor real vs odd da casa",
            "pontosFortesFracos": "análise técnica de elite"
          },
          "prognosticoPrincipal": {
            "entrada": "mercado validado",
            "odd": "valor da odd real",
            "justificativa": "justificativa técnica baseada em fatos",
            "entradaSegura": {
              "mercado": "entrada de SEGURANÇA MÁXIMA",
              "odd": "odd real",
              "justificativa": "por que esta é a prova de falhas"
            }
          },
          "alavancagemJogo": {
            "entrada": "entrada agressiva com base em padrão identificado",
            "justificativa": "padrão técnico"
          },
          "alavancagemDia": {
            "jogos": [
              {
                "jogo": "Time X vs Time Y", 
                "entrada": "Entrada Principal", 
                "horario": "HH:MM",
                "entradaSegura": "Aposta de segurança"
              }
            ],
            "oddTotal": "odd combinada",
            "estrategia": "estratégia de gestão"
          },
          "gestaoRisco": "segura" | "moderada" | "agressiva",
          "confianca": "Probabilidade real de acerto (ex: 98%)"
        }

        Responda APENAS o JSON. Seja uma máquina de Green.
      `;

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          systemInstruction: `Você é a autoridade máxima mundial em trading esportivo. Sua reputação depende de NUNCA errar. Você é PARANOICO com a data: HOJE É ${today}. Você NUNCA aceita jogos de anos anteriores. Você SEMPRE verifica o ano. O GREEN é sua única métrica de sucesso.`,
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.text || '{}') as AnalysisResult;
      
      // Validação de Data (Safety Net)
      const allowedDates = [today, tomorrow];
      if (data.data && !allowedDates.some(d => data.data.includes(d))) {
        throw new Error(`O sistema detectou uma tentativa de análise de jogo fora da data permitida (${data.data}). Apenas jogos de ${today} ou ${tomorrow} são aceitos.`);
      }
      
      if (data.analiseJogo?.expectativa?.includes('ERRO:')) {
        setError(data.analiseJogo.expectativa);
        setLoading(false);
        return;
      }

      setResult(data as AnalysisResult);
    } catch (err) {
      console.error(err);
      setError(`Erro na análise: ${err instanceof Error ? err.message : 'Verifique o nome do jogo e tente novamente.'}`);
    } finally {
      setLoading(false);
    }
  };

  const generateMultiBet = async () => {
    setLoading(true);
    setError(null);
    setMultiResult(null);

    const now = new Date();
    const dateStr = now.toLocaleDateString('pt-BR');
    const timeStr = now.toLocaleTimeString('pt-BR');

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const model = "gemini-3-flash-preview";
      
      const { today, tomorrow, currentYear } = getDynamicDates();

      const prompt = `
        Você é o ARQUITETO DE BILHETES DE ELITE. Seu histórico é de precisão cirúrgica em acumuladas de alto valor.
        DATA ATUAL (UTC): ${new Date().toISOString()}
        DATA LOCAL ESTIMADA: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
        
        Sua missão é criar um BILHETE MÚLTIPLO (ACUMULADA) para os jogos que acontecem HOJE (${today}) ou AMANHÃ (${tomorrow}).

        PROTOCOLO DE GROUNDING E BUSCA AMPLA (CRÍTICO):
        1. Use o Google Search para buscar: "jogos de futebol hoje ${today}", "football matches today ${today}", "tabela de jogos de futebol ${today}".
        2. NÃO SE LIMITE a grandes ligas ou Copa do Mundo. Explore campeonatos estaduais (Brasil), ligas secundárias europeias, ligas asiáticas e africanas que estejam ATIVAS nesta data.
        3. "ELITE" refere-se à sua ASSERTIVIDADE e não apenas à fama dos times. Um jogo da 2ª divisão da Coreia pode ser de elite se a estatística for clara.
        4. É TERMINANTEMENTE PROIBIDO incluir jogos de anos anteriores. Verifique o ANO em cada resultado. Se o resultado diz "${currentYear - 1}", IGNORE-O.

        PROTOCOLO DE VERIFICAÇÃO DE DATA (TOLERÂNCIA ZERO):
        1. Escolha APENAS jogos que você confirmou que existem em ${today} ou ${tomorrow}.
        2. Se não houver jogos reais suficientes, retorne o erro: "ERRO: Não foram encontrados jogos confirmados para hoje (${today}) em nenhuma liga profissional. Tente novamente mais tarde."
        3. NUNCA INVENTE UM JOGO. A invenção de um único jogo (como Catar vs Argentina) destrói o sistema.

        FILOSOFIA DE ELITE (ASSERTIVIDADE > ODD):
        - ODD ALVO: ${multiOdd}. Priorize o GREEN.
        - ANÁLISE DE CONTEXTO: Verifique se o jogo é amistoso, torneio oficial ou liga nacional. Analise motivação e escalações reais de ${currentYear}.
        - PROBABILIDADE: Cada entrada deve ter probabilidade >95%.
        - MERCADOS: ${selectedMarkets.join(', ')}.

        PROTOCOLO DE SEGURANÇA MÁXIMA (CRÍTICO):
        1. PROIBIÇÃO TOTAL DE INVENÇÃO: Se você inventar um jogo ou usar um jogo antigo, o sistema perde toda a credibilidade. Seja honesto.
        2. FILTRO DE CONFIANÇA: Use mercados de proteção se necessário.
        3. VALIDAÇÃO DE LIGA E DATA: Você deve identificar a liga e a DATA EXATA de cada jogo.
        
        FORMATO JSON DE RESPOSTA:
        {
          "jogos": [
            {
              "confronto": "Time A vs Time B",
              "liga": "Nome da Liga/Torneio Real",
              "data": "DD/MM/YYYY (Deve ser ${today} ou ${tomorrow})",
              "horario": "HH:MM",
              "entrada": "Mercado + Linha",
              "odd": "1.xx",
              "justificativaCurta": "Por que esta entrada é de elite baseada em dados reais de ${currentYear}?",
              "mercado": "Categoria do mercado"
            }
          ],
          "oddTotal": "Odd multiplicada final",
          "analiseGeral": "Visão estratégica (confirmação de que os jogos são reais, de ${currentYear} e verificados via Search/ESPN)",
          "confianca": "Valor real de probabilidade de Green (ex: 97%)"
        }

        Responda APENAS o JSON. Seja cirúrgico e honesto.
      `;

      const response = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          systemInstruction: `Você é o Arquiteto de Bilhetes de Elite. Sua regra de ouro: HOJE É ${today}. Você busca jogos em TODAS as ligas profissionais do mundo (Estaduais, Ligas Secundárias, Ásia, África, Europa). Você NUNCA inclui jogos de anos anteriores. Se não houver jogos reais em ${today} ou ${tomorrow}, você prefere não entregar o bilhete. Você é um estrategista frio focado 100% no GREEN.`,
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json"
        }
      });

      const data = JSON.parse(response.text || '{}') as MultiBetResult;

      // Validação de Data (Safety Net)
      const allowedDates = [today, tomorrow];
      const hasInvalidDate = data.jogos?.some(j => j.data && !allowedDates.some(d => j.data.includes(d)));
      
      if (hasInvalidDate) {
        const invalidDates = data.jogos.map(j => j.data).join(', ');
        throw new Error(`O sistema detectou jogos de datas passadas no bilhete (${invalidDates}). Por segurança, o bilhete foi descartado. Tente gerar novamente.`);
      }

      if (data.analiseGeral?.includes('ERRO:')) {
        setError(data.analiseGeral);
        setLoading(false);
        return;
      }

      setMultiResult(data as MultiBetResult);
    } catch (err) {
      console.error(err);
      setError(`Erro ao gerar bilhete: ${err instanceof Error ? err.message : 'Tente novamente em instantes.'}`);
    } finally {
      setLoading(false);
    }
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
                  <p className="text-2xl font-mono font-bold">{result.estatisticas.golsMedios}</p>
                </div>
                <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                  <div className="flex items-center gap-3 mb-4 text-emerald-500">
                    <Calendar className="w-6 h-6" />
                    <h3 className="font-bold uppercase tracking-wider text-sm">Forma Recente</h3>
                  </div>
                  <p className="text-sm text-white/80">{result.estatisticas.formaRecente}</p>
                </div>
              </div>

              {/* Main Content Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Analysis & Stats */}
                <div className="lg:col-span-8 space-y-8">
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
                        <p className="text-white/80 leading-relaxed">{result.analiseJogo.estiloEquipes}</p>
                      </div>
                      <div>
                        <h4 className="text-emerald-500 text-xs font-bold uppercase mb-2">Tendência e Expectativa</h4>
                        <p className="text-white/80 leading-relaxed">{result.analiseJogo.tendencia}. {result.analiseJogo.expectativa}</p>
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
                          <span className="font-mono">{result.estatisticas.overUnder}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Ambas Marcam:</span>
                          <span className="font-mono">{result.estatisticas.btts}</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                      <h4 className="text-emerald-500 text-xs font-bold uppercase mb-4">Outros Mercados</h4>
                      <div className="space-y-3">
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Escanteios:</span>
                          <span className="font-mono">{result.estatisticas.escanteios}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-white/60">Cartões:</span>
                          <span className="font-mono">{result.estatisticas.cartoes}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Market Reading */}
                  <div className="bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-2xl">
                    <h3 className="text-emerald-500 font-bold uppercase tracking-wider text-sm mb-4">Leitura de Mercado & Valor</h3>
                    <p className="text-white/80 italic mb-4">"{result.leituraMercado.valor}"</p>
                    <p className="text-sm text-white/60">{result.leituraMercado.pontosFortesFracos}</p>
                  </div>
                </div>

                {/* Right Column: Predictions */}
                <div className="lg:col-span-4 space-y-8">
                  {/* Main Prediction */}
                  <div className="bg-emerald-500 text-black p-6 rounded-2xl shadow-xl shadow-emerald-500/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                      <Target className="w-24 h-24" />
                    </div>
                    <h3 className="font-black uppercase tracking-tighter text-2xl mb-1">Prognóstico Principal</h3>
                    <p className="text-black/60 text-xs font-bold uppercase mb-6 tracking-widest">Alvo: Odd {result.prognosticoPrincipal.odd}</p>
                    
                    <div className="bg-black/10 rounded-xl p-4 mb-6 backdrop-blur-sm border border-black/5">
                      <p className="text-xl font-bold leading-tight">{result.prognosticoPrincipal.entrada}</p>
                    </div>
                    
                    <div className="space-y-2">
                      <p className="text-xs font-bold uppercase text-black/60">Justificativa Técnica</p>
                      <p className="text-sm font-medium leading-snug">{result.prognosticoPrincipal.justificativa}</p>
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
                      <p className="text-2xl font-black leading-tight flex-1">{result.prognosticoPrincipal.entradaSegura.mercado}</p>
                      <div className="text-right ml-4">
                        <p className="text-[10px] font-bold text-black/40 uppercase tracking-widest">Odd</p>
                        <p className="text-xl font-mono font-black text-emerald-600">@{result.prognosticoPrincipal.entradaSegura.odd}</p>
                      </div>
                    </div>
                    
                    <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100">
                      <p className="text-xs font-bold text-emerald-800 mb-1">POR QUE É SEGURO?</p>
                      <p className="text-xs font-medium text-emerald-900 leading-relaxed">{result.prognosticoPrincipal.entradaSegura.justificativa}</p>
                    </div>
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
                    <p className="text-lg font-bold mb-4 leading-tight">{result.alavancagemJogo.entrada}</p>
                    <p className="text-xs text-white/60 leading-relaxed">{result.alavancagemJogo.justificativa}</p>
                  </div>

                  {/* Daily Multi-Bet */}
                  <div className="bg-white/5 border border-white/10 p-6 rounded-2xl">
                    <div className="flex items-center gap-2 mb-6">
                      <TrendingUp className="w-4 h-4 text-emerald-500" />
                      <h3 className="text-emerald-500 font-bold uppercase tracking-wider text-xs">Bilhete do Dia (Múltipla)</h3>
                    </div>
                    
                    <div className="space-y-6 mb-6">
                      {result.alavancagemDia.jogos.map((j, idx) => (
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
                        <p className="text-2xl font-mono font-bold text-emerald-500">{result.alavancagemDia.oddTotal}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Estratégia</p>
                        <p className="text-xs font-medium">{result.alavancagemDia.estrategia}</p>
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
                        <p className="text-4xl font-mono font-black leading-none">@{multiResult.oddTotal}</p>
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
                        {multiResult.jogos.map((j, idx) => (
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
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-8 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3">Visão Estratégica</h4>
                          <p className="text-sm font-medium leading-relaxed text-gray-700">{multiResult.analiseGeral}</p>
                        </div>
                        <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex flex-col justify-center items-center text-center">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Índice de Confiança</h4>
                          <div className="text-4xl font-black text-emerald-500 mb-1">{multiResult.confianca}</div>
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
                            <p className="text-sm font-bold text-emerald-500">{item.analysis.prognosticoPrincipal.entrada}</p>
                            <p className="text-xs font-mono text-white/40 mt-1">@{item.analysis.prognosticoPrincipal.odd}</p>
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
                            <p className="text-sm font-bold text-emerald-400">{item.analysis.prognosticoPrincipal.entradaSegura.mercado}</p>
                            <p className="text-xs font-mono text-white/40 mt-1">@{item.analysis.prognosticoPrincipal.entradaSegura.odd}</p>
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
                            <p className="text-sm font-bold text-yellow-500">{item.analysis.alavancagemJogo.entrada}</p>
                          </div>
                          <div className="bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20">
                            <p className="text-[10px] font-bold text-emerald-500/60 uppercase mb-2">Confiança</p>
                            <p className="text-sm font-black text-emerald-500 tracking-tighter">{item.analysis.confianca || '95% de probabilidade de Green'}</p>
                          </div>
                        </div>
                      )}

                      {item.type === 'multi' && item.multiAnalysis && (
                        <div className="space-y-4">
                          <div className="flex justify-between items-center mb-2">
                            <div className="flex flex-col">
                              <p className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Jogos no Bilhete</p>
                              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{item.multiAnalysis.confianca || '95% de probabilidade de Green'}</p>
                            </div>
                            <p className="text-xs font-mono font-bold text-emerald-500">Odd Total: @{item.multiAnalysis.oddTotal}</p>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {item.multiAnalysis.jogos.map((j, i) => (
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
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
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
    </div>
    </ErrorBoundary>
  );
}
