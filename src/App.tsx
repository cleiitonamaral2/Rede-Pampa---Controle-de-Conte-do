import React, { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PlusCircle, 
  Search, 
  User, 
  Clock, 
  Calendar, 
  CheckCircle2, 
  AlertCircle,
  Trash2,
  LayoutDashboard,
  Filter,
  Download
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Configuração do Supabase (As chaves serão injetadas via variáveis de ambiente no Netlify)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Inicializa apenas se as chaves existirem para evitar erro fatal
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

interface ContentLog {
  id: number;
  title: string;
  designer: string;
  date: string;
  time: string;
}

export default function App() {
  const [contents, setContents] = useState<ContentLog[]>([]);
  const [title, setTitle] = useState('');
  const [designer, setDesigner] = useState('');
  const [search, setSearch] = useState('');
  const [designerFilter, setDesignerFilter] = useState('Todos');
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    
    const loadContents = async () => {
      const today = format(new Date(), "yyyy-MM-dd");
      const { data, error } = await supabase
        .from('content_logs')
        .select('*')
        .eq('date', today)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao carregar conteúdos:', error);
      } else {
        setContents(data || []);
      }
    };

    loadContents();

    // Setup Real-time do Supabase (Funciona no Netlify!)
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'content_logs' },
        (payload) => {
          const newContent = payload.new as ContentLog;
          // Só adiciona se for de hoje
          if (newContent.date === format(new Date(), "yyyy-MM-dd")) {
            setContents(prev => [newContent, ...prev]);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'content_logs' },
        (payload) => {
          setContents(prev => prev.filter(c => c.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !designer.trim()) {
      setStatus({ type: 'error', message: 'Preencha todos os campos obrigatórios.' });
      return;
    }

    if (!supabase) {
      setStatus({ type: 'error', message: 'Configuração do banco de dados pendente no Netlify.' });
      return;
    }

    setIsLoading(true);
    try {
      const today = format(new Date(), "yyyy-MM-dd");
      const currentTime = format(new Date(), "HH:mm:ss");

      // Verificar duplicidade
      const { data: existing } = await supabase
        .from('content_logs')
        .select('id')
        .eq('title', title)
        .eq('date', today)
        .maybeSingle();

      if (existing) {
        setStatus({ type: 'error', message: 'Este conteúdo já foi registrado hoje.' });
        return;
      }

      const { error } = await supabase
        .from('content_logs')
        .insert([{ title, designer, date: today, time: currentTime }]);

      if (error) throw error;

      setStatus({ type: 'success', message: 'Conteúdo registrado com sucesso!' });
      setTitle('');
    } catch (err) {
      console.error('Erro na requisição:', err);
      setStatus({ 
        type: 'error', 
        message: `Erro: ${err instanceof Error ? err.message : 'Falha ao salvar no banco de dados'}` 
      });
    } finally {
      setIsLoading(false);
      setTimeout(() => setStatus(null), 3000);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;

    if (!supabase) return;

    try {
      const { error } = await supabase
        .from('content_logs')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.error('Erro ao excluir:', err);
      alert('Erro ao excluir registro.');
    }
  };

  const handleDownload = async () => {
    if (!supabase) return;

    try {
      const { data, error } = await supabase
        .from('content_logs')
        .select('title, designer, date, time')
        .order('date', { ascending: false });

      if (error) throw error;

      let csv = "\ufeffNome do Conteudo,Designer,Data,Hora\n";
      data.forEach((row: any) => {
        csv += `"${row.title.replace(/"/g, '""')}","${row.designer.replace(/"/g, '""')}",${row.date},${row.time}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "pampa_controle.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Erro no download:', err);
      alert('Erro ao gerar planilha.');
    }
  };

  const filteredContents = useMemo(() => {
    return contents.filter(c => {
      const matchesSearch = c.title.toLowerCase().includes(search.toLowerCase()) || 
                           c.designer.toLowerCase().includes(search.toLowerCase());
      const matchesDesigner = designerFilter === 'Todos' || c.designer === designerFilter;
      return matchesSearch && matchesDesigner;
    });
  }, [contents, search, designerFilter]);

  const designerStats = useMemo(() => {
    const stats: Record<string, number> = {};
    contents.forEach(c => {
      stats[c.designer] = (stats[c.designer] || 0) + 1;
    });
    return stats;
  }, [contents]);

  const uniqueDesigners = useMemo(() => {
    return ['Todos', ...Array.from(new Set(contents.map(c => c.designer)))];
  }, [contents]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans selection:bg-orange-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img 
              src="https://res.cloudinary.com/dobcfwbhp/image/upload/v1772459507/Rede-Pampa-Redes-Sociais-Horizontal_glswrr.png" 
              alt="Rede Pampa" 
              className="h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div className="h-8 w-px bg-gray-200 hidden sm:block"></div>
            <p className="text-xs text-gray-500 font-bold uppercase tracking-widest hidden sm:block">Controle de Conteúdo</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-gray-900 capitalize">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}</p>
            <p className="text-xs text-gray-500">Porto Alegre, RS</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        {!supabase && (
          <div className="lg:col-span-12 bg-red-50 border border-red-200 p-6 rounded-2xl flex items-center gap-4 text-red-800">
            <AlertCircle className="shrink-0" />
            <div>
              <p className="font-bold">Configuração Necessária</p>
              <p className="text-sm">Para o sistema funcionar no Netlify, você precisa configurar as variáveis <b>VITE_SUPABASE_URL</b> e <b>VITE_SUPABASE_ANON_KEY</b> no painel do Netlify.</p>
            </div>
          </div>
        )}
        
        {/* Left Column: Registration Form */}
        <div className="lg:col-span-4 space-y-8">
          <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <PlusCircle size={20} className="text-orange-600" />
              Novo Registro
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Título do Conteúdo</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex: Matéria sobre Tecnologia"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Designer Responsável</label>
                <input
                  type="text"
                  value={designer}
                  onChange={(e) => setDesigner(e.target.value)}
                  placeholder="Seu nome completo"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 text-white font-bold py-4 rounded-xl shadow-lg shadow-orange-600/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                {isLoading ? 'Registrando...' : 'Registrar Conteúdo'}
              </button>
            </form>

            <AnimatePresence>
              {status && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`mt-6 p-4 rounded-xl flex items-center gap-3 border ${
                    status.type === 'success' 
                      ? 'bg-orange-50 border-orange-100 text-orange-800' 
                      : 'bg-red-50 border-red-100 text-red-800'
                  }`}
                >
                  {status.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
                  <p className="text-sm font-medium">{status.message}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* Stats Card */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm">
            <h2 className="text-lg font-bold mb-6 flex items-center gap-2">
              <LayoutDashboard size={20} className="text-orange-600" />
              Produção de Hoje
            </h2>
            <div className="space-y-4">
              {Object.entries(designerStats).length === 0 ? (
                <p className="text-sm text-gray-400 italic">Nenhum registro hoje.</p>
              ) : (
                Object.entries(designerStats).map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <span className="text-sm font-semibold text-gray-700">{name}</span>
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2.5 py-1 rounded-full">{count} {count === 1 ? 'item' : 'itens'}</span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Content List */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Buscar conteúdo ou designer..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 outline-none transition-all"
              />
            </div>
            <div className="relative min-w-[180px]">
              <Filter className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <select
                value={designerFilter}
                onChange={(e) => setDesignerFilter(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-orange-500 outline-none appearance-none bg-white transition-all cursor-pointer"
              >
                {uniqueDesigners.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <AnimatePresence mode="popLayout">
              {filteredContents.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="bg-white rounded-2xl border border-dashed border-gray-300 p-20 text-center"
                >
                  <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Search size={32} className="text-gray-300" />
                  </div>
                  <p className="text-gray-500 font-medium">Nenhum conteúdo encontrado.</p>
                </motion.div>
              ) : (
                filteredContents.map((content) => (
                  <motion.div
                    key={content.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight">{content.title}</h3>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                          <div className="flex items-center gap-1.5">
                            <User size={14} className="text-orange-600" />
                            <span className="font-semibold text-gray-700">{content.designer}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar size={14} />
                            <span>{format(new Date(content.date + 'T00:00:00'), 'dd/MM/yyyy')}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock size={14} />
                            <span>{content.time}</span>
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(content.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title="Excluir registro"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-10 border-t border-gray-200 mt-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-400 font-bold uppercase tracking-widest mb-8">
          <p>© {new Date().getFullYear()} Rede Pampa - Sistema Interno</p>
          <div className="flex gap-6">
            <span className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              Sistema Ativo
            </span>
            <span>Versão 1.1.0</span>
          </div>
        </div>
        <div className="text-center space-y-4">
          <button 
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-[10px] font-bold text-gray-500 hover:text-orange-600 hover:border-orange-200 hover:bg-orange-50 transition-all uppercase tracking-widest shadow-sm active:scale-95"
          >
            <Download size={12} />
            Baixar Planilha (CSV)
          </button>
          <div className="block">
            <a 
              href="https://instagram.com/cleiton.asix" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] text-gray-400 hover:text-orange-500 transition-colors font-medium uppercase tracking-widest"
            >
              criado por Cleiton.asix
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
