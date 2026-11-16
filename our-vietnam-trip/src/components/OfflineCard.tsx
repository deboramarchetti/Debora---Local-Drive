import { AlertTriangle, CheckCircle2, CloudDownload, Loader2, WifiOff } from 'lucide-react';
import { useOffline } from '../state/offline';

const fmtTime = (iso?: string) =>
  iso ? new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '';

export function OfflineCard() {
  const { status, save, online } = useOffline();
  const s = status.state;
  const busy = s === 'downloading';

  const view = {
    pending: { Icon: CloudDownload, tone: 'text-ink-2', title: 'Download pendente', text: 'Salve o roteiro neste celular para usar sem internet.' },
    downloading: { Icon: Loader2, tone: 'text-gold', title: 'Baixando…', text: `Salvando roteiro, mapa, reservas e imagens${status.progress ? ` · ${Math.round(status.progress * 100)}%` : ''}` },
    ready: { Icon: CheckCircle2, tone: 'text-jade', title: 'Disponível offline', text: `${status.total ?? ''} arquivos verificados${status.checkedAt ? ` · ${fmtTime(status.checkedAt)}` : ''}` },
    error: { Icon: AlertTriangle, tone: 'text-lacquer', title: 'Erro ao salvar', text: status.message ?? 'Tente novamente com conexão.' },
    unsupported: { Icon: WifiOff, tone: 'text-ink-3', title: 'Offline indisponível', text: status.message ?? '' },
  }[s];

  return (
    <div className="card mx-5 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-paper ${view.tone}`}>
          <view.Icon size={20} className={busy ? 'animate-spin' : ''} aria-hidden />
        </div>
        <div className="min-w-0 flex-1" aria-live="polite">
          <div className="font-medium">{view.title}</div>
          <div className="text-[13px] text-ink-3">{view.text}</div>
          {s === 'ready' && status.persisted === false && (
            <div className="mt-1 text-[12px] text-ink-3">Dica: instale na tela de início para o sistema não apagar os dados.</div>
          )}
        </div>
      </div>
      {busy && (
        <div className="h-1 bg-paper-2">
          <div className="h-full bg-gold transition-[width] duration-300" style={{ width: `${Math.max(4, (status.progress ?? 0) * 100)}%` }} />
        </div>
      )}
      {s !== 'unsupported' && (
        <button
          onClick={save}
          disabled={busy || (!online && s !== 'ready')}
          className="tap w-full border-t border-line px-4 py-3 text-[14px] font-semibold text-lacquer disabled:text-ink-3"
        >
          {s === 'ready' ? 'Verificar novamente' : busy ? 'Aguarde…' : !online ? 'Conecte-se para salvar' : 'Save Trip Offline'}
        </button>
      )}
    </div>
  );
}
