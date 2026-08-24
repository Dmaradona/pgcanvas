"use client";

import { useEffect, useState } from "react";
import {
  CircleAlert,
  CloudOff,
  CloudUpload,
  Clock,
  FolderOpen,
  HardDrive,
  LogOut,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useCloud } from "@/lib/cloud";
import { cloudHost } from "@/lib/supabase";
import { Button, Field, Modal, TextInput } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";

/**
 * A conta ainda nao esta liberada para os alunos. O codigo do Supabase fica
 * pronto no repositorio e liga com NEXT_PUBLIC_ENABLE_CLOUD=true, mas por
 * padrao a tela diz "em breve" e o trabalho continua no proprio navegador.
 */
const CLOUD_ENABLED = process.env.NEXT_PUBLIC_ENABLE_CLOUD === "true";

function ComingSoon() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2.5 rounded-md border border-violet/30 bg-violet-soft px-3 py-3">
        <Clock size={16} className="mt-px shrink-0 text-violet" />
        <div>
          <p className="text-[13px] font-semibold text-violet">Contas e sincronização: em breve</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink">
            Entrar com e-mail para abrir seus modelos de qualquer máquina está a caminho. Nada do
            que você faz hoje se perde nessa mudança.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-md border border-line bg-surface-2 px-3 py-3">
        <HardDrive size={16} className="mt-px shrink-0 text-ink-faint" />
        <div>
          <p className="text-[13px] font-semibold">Enquanto isso, tudo fica neste navegador</p>
          <ul className="mt-1 space-y-1 text-[12px] leading-relaxed text-ink-soft">
            <li>O modelo aberto volta sozinho quando você reabre a página.</li>
            <li>
              Em <strong>Meus modelos</strong> dá para guardar vários e retomar depois.
            </li>
            <li>Os dados preenchidos à mão também voltam, enquanto couberem no navegador.</li>
          </ul>
        </div>
      </div>

      <div>
        <p className="field-label">Para levar embora</p>
        <p className="text-[12px] leading-relaxed text-ink-soft">
          Exporte quando terminar: JSON do modelo e DDL na barra superior, script de{" "}
          <span className="font-mono">INSERT</span> e CSV na aba de simulação. É o que garante o
          trabalho fora deste computador, e continua valendo depois que a conta existir.
        </p>
      </div>

      <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-faint">
        Quem hospeda a própria cópia pode ligar a nuvem agora: rode{" "}
        <span className="font-mono">supabase/schema.sql</span>, preencha as variáveis do{" "}
        <span className="font-mono">.env.example</span> e defina{" "}
        <span className="font-mono">NEXT_PUBLIC_ENABLE_CLOUD=true</span>.
      </p>
    </div>
  );
}

function whenText(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NotConfigured({ unsafe }: { unsafe: boolean }) {
  return (
    <div className="space-y-3">
      <div
        className={cn(
          "flex items-start gap-2 rounded-md border px-3 py-2.5",
          unsafe ? "border-alerta bg-alerta-soft" : "border-line bg-surface-2",
        )}
      >
        {unsafe ? (
          <ShieldAlert size={16} className="mt-px shrink-0 text-alerta" />
        ) : (
          <CloudOff size={16} className="mt-px shrink-0 text-ink-faint" />
        )}
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">
            {unsafe ? "Essa chave é secreta, não pode ir para o navegador" : "Nuvem não configurada"}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-ink-soft">
            {unsafe
              ? "A chave em NEXT_PUBLIC_SUPABASE_ANON_KEY é uma service_role, que ignora o RLS e daria acesso total ao banco. Troque pela chave anônima (anon / publishable) do projeto e gire a que vazou."
              : "O pgcanvas funciona inteiro sem conta. O login serve para guardar seus modelos e abrir de outra máquina."}
          </p>
        </div>
      </div>

      <div>
        <p className="field-label">Para ligar</p>
        <ol className="space-y-1.5 text-[12px] leading-relaxed text-ink-soft">
          <li>
            1. Crie um projeto em <span className="font-mono">supabase.com</span>.
          </li>
          <li>
            2. No SQL Editor, rode o arquivo{" "}
            <span className="font-mono">supabase/schema.sql</span> deste repositório. Ele cria a
            tabela e as políticas de RLS.
          </li>
          <li>
            3. Copie <span className="font-mono">Project URL</span> e a chave{" "}
            <span className="font-mono">anon public</span> em Settings, API.
          </li>
          <li>
            4. Preencha <span className="font-mono">.env.local</span> a partir de{" "}
            <span className="font-mono">.env.example</span> e reinicie o servidor.
          </li>
        </ol>
      </div>

      <pre className="overflow-x-auto rounded-md border border-line bg-surface-2 px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-soft">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...`}
      </pre>
    </div>
  );
}

function SignIn() {
  const signIn = useCloud((state) => state.signIn);
  const signUp = useCloud((state) => state.signUp);
  const busy = useCloud((state) => state.busy);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const disabled = busy || email.trim().length === 0 || password.length < 6;

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) void signIn(email, password);
      }}
    >
      <p className="text-[12.5px] leading-relaxed text-ink-soft">
        Entre para guardar seus modelos na sua conta. Cada pessoa enxerga apenas os próprios
        modelos, garantido pelo RLS do PostgreSQL.
      </p>
      <Field label="E-mail">
        <TextInput
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </Field>
      <Field label="Senha" hint="Mínimo de 6 caracteres">
        <TextInput
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" className="flex-1" disabled={disabled}>
          Entrar
        </Button>
        <Button variant="subtle" disabled={disabled} onClick={() => void signUp(email, password)}>
          Criar conta
        </Button>
      </div>
    </form>
  );
}

function Library({ onClose }: { onClose: () => void }) {
  const diagram = useStore((state) => state.diagram);
  const loadDiagram = useStore((state) => state.loadDiagram);
  const setMode = useStore((state) => state.setMode);

  const user = useCloud((state) => state.user);
  const docs = useCloud((state) => state.docs);
  const busy = useCloud((state) => state.busy);
  const currentId = useCloud((state) => state.currentId);
  const signOut = useCloud((state) => state.signOut);
  const saveNew = useCloud((state) => state.saveNew);
  const saveOver = useCloud((state) => state.saveOver);
  const fetchDiagram = useCloud((state) => state.fetchDiagram);
  const remove = useCloud((state) => state.remove);

  const [name, setName] = useState(diagram.name);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const current = docs.find((doc) => doc.id === currentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-semibold">{user?.email}</p>
          <p className="truncate font-mono text-[10.5px] text-ink-faint">{cloudHost()}</p>
        </div>
        <Button size="sm" variant="subtle" onClick={() => void signOut()}>
          <LogOut size={13} />
          Sair
        </Button>
      </div>

      <div>
        <Field label="Salvar o modelo aberto como">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <div className="mt-2 flex gap-2">
          <Button
            variant="primary"
            className="flex-1"
            disabled={busy}
            onClick={() => void saveNew(name, { ...diagram, name })}
          >
            <CloudUpload size={14} />
            Salvar como novo
          </Button>
          {current ? (
            <Button
              variant="subtle"
              disabled={busy}
              onClick={() => void saveOver(current.id, name, { ...diagram, name })}
            >
              <Save size={14} />
              Salvar em &quot;{current.name}&quot;
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <p className="field-label">Seus modelos ({docs.length})</p>
        {docs.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[12px] text-ink-faint">
            Nada salvo ainda.
          </p>
        ) : (
          <ul className="max-h-[220px] space-y-1 overflow-y-auto">
            {docs.map((doc) => (
              <li
                key={doc.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2",
                  doc.id === currentId ? "border-elephant bg-elephant-soft" : "border-line",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium">{doc.name}</span>
                  <span className="block font-mono text-[10.5px] text-ink-faint">
                    {whenText(doc.updated_at)}
                  </span>
                </span>

                {confirmId === doc.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy}
                      onClick={() => {
                        void remove(doc.id);
                        setConfirmId(null);
                      }}
                    >
                      Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>
                      Não
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="sm"
                      variant="subtle"
                      disabled={busy}
                      onClick={async () => {
                        const loaded = await fetchDiagram(doc.id);
                        if (!loaded) return;
                        loadDiagram(loaded);
                        setMode("modeler");
                        onClose();
                      }}
                    >
                      <FolderOpen size={13} />
                      Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Remover ${doc.name}`}
                      title="Remover da nuvem"
                      onClick={() => setConfirmId(doc.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] leading-relaxed text-ink-faint">
        Abrir um modelo da nuvem substitui o que está na tela. Só o modelo é guardado; os dados
        gerados na simulação continuam apenas nesta aba.
      </p>
    </div>
  );
}

export function CloudModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useCloud((state) => state.status);
  const user = useCloud((state) => state.user);
  const error = useCloud((state) => state.error);
  const notice = useCloud((state) => state.notice);
  const clearMessages = useCloud((state) => state.clearMessages);
  const init = useCloud((state) => state.init);

  useEffect(() => {
    if (CLOUD_ENABLED) init();
  }, [init]);

  const title = !CLOUD_ENABLED
    ? "Entrar na conta"
    : status === "ready" && user
      ? "Seus modelos na nuvem"
      : "Entrar na nuvem";

  return (
    <Modal
      open={open}
      width={520}
      title={title}
      onClose={() => {
        clearMessages();
        onClose();
      }}
    >
      <div className="space-y-3">
        {!CLOUD_ENABLED ? (
          <ComingSoon />
        ) : status !== "ready" ? (
          <NotConfigured unsafe={status === "unsafe"} />
        ) : user ? (
          <Library onClose={onClose} />
        ) : (
          <SignIn />
        )}

        {CLOUD_ENABLED && error ? (
          <p className="flex items-start gap-2 rounded-md border border-alerta bg-alerta-soft px-3 py-2 text-[12px] leading-relaxed text-alerta">
            <CircleAlert size={14} className="mt-px shrink-0" />
            {error}
          </p>
        ) : null}
        {CLOUD_ENABLED && notice ? (
          <p className="rounded-md border border-dado/40 bg-dado-soft px-3 py-2 text-[12px] leading-relaxed text-dado">
            {notice}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
