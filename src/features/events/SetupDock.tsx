import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { NavLink } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { eventKeys, getEvent, setEventStep } from './api'
import { pendingSteps, setupStepInfo } from './model'
import type { EventRecord, SetupStep } from './model'
import { useAuth } from '../auth/context'
import { errorMessage } from '../../lib/errors'
import { Button } from '../../components/ui'

// Barra fixa no rodapé enquanto o evento publicado tem etapa pendente. Não prende
// o organizador: é só um atalho, e some quando as duas etapas estão concluídas.
export function SetupDock({ event }: { event: EventRecord }) {
  const pending = pendingSteps(event)
  const bar = useRef<HTMLDivElement>(null)
  const visible = pending.length > 0
  // Com texto ampliado a barra pode cobrir boa parte da tela: acima de 30% da altura
  // da janela ela deixa de flutuar e fica no fim da página. Ao redimensionar ou
  // mudar o zoom, volta a flutuar e é medida de novo.
  const [floating, setFloating] = useState(true)
  useLayoutEffect(() => {
    if (visible && floating && bar.current && bar.current.offsetHeight > window.innerHeight * 0.3) setFloating(false)
  }, [visible, floating, pending.length])
  useEffect(() => {
    const retry = () => setFloating(true)
    window.addEventListener('resize', retry)
    return () => window.removeEventListener('resize', retry)
  }, [])
  // O navegador só rola até o foco quando ele está fora da tela; atrás da barra ele
  // continuaria escondido. Aqui o elemento focado sobe o suficiente para aparecer.
  useEffect(() => {
    if (!visible || !floating) return
    function reveal(e: FocusEvent) {
      const target = e.target as Element | null
      if (!bar.current || !target || bar.current.contains(target) || !(target instanceof HTMLElement)) return
      const overlap = target.getBoundingClientRect().bottom - bar.current.getBoundingClientRect().top + 16
      if (overlap > 16) window.scrollBy({ top: overlap })
    }
    document.addEventListener('focusin', reveal)
    return () => document.removeEventListener('focusin', reveal)
  }, [visible, floating])
  if (!visible) return null
  // No `body`: a animação de entrada de `.page` deixa um `transform` que prenderia
  // o `position: fixed` ao fim da página em vez do rodapé da janela.
  const dock = <nav aria-label="Etapas pendentes" className={floating ? 'setup-dock' : 'setup-dock setup-dock-static'}>
    <div ref={bar} className="setup-dock-inner">
      <p className="setup-dock-title">{pending.length === 1 ? 'Falta 1 etapa para o evento ficar pronto:' : `Faltam ${pending.length} etapas para o evento ficar pronto:`}</p>
      <ul className="setup-dock-steps">
        {pending.map((step, index) => {
          const { short, path } = setupStepInfo[step]
          return <li key={step}><NavLink end to={`/eventos/${event.id}${path ? `/${path}` : ''}`} className={`${index === 0 ? 'button' : 'secondary'} btn-sm`}>{short}</NavLink></li>
        })}
      </ul>
    </div>
  </nav>
  return floating ? createPortal(dock, document.body) : dock
}

// Card de conclusão no topo da etapa. Quem decide se terminou é o organizador;
// a data fica no banco e pode ser desfeita com “Reabrir etapa”.
export function StepCompletion({ event, step }: { event: EventRecord; step: SetupStep }) {
  const cache = useQueryClient()
  const { session } = useAuth()
  const [notice, setNotice] = useState('')
  const noticeRef = useRef<HTMLParagraphElement>(null)
  // Trava síncrona: o clique duplo chega antes de o botão ficar ocupado.
  const sending = useRef(false)
  const change = useMutation({
    mutationFn: (done: boolean) => setEventStep(event, step, done),
    onSettled: () => { sending.current = false },
    onSuccess: async (next, done) => {
      cache.setQueryData([...eventKeys.detail(next.id), session?.user.id], next)
      setNotice(!done ? 'Etapa reaberta.' : pendingSteps(next).length ? 'Etapa concluída.' : 'Tudo pronto! Seu evento está completo.')
      await cache.invalidateQueries({ queryKey: eventKeys.all })
    },
    // Mudou em outra aba: a versão atual entra no cache. Se a outra aba já deixou a
    // etapa como a pessoa pediu, não há o que tentar de novo e o erro não aparece.
    onError: async (cause, done) => {
      if ((cause as Error).message !== 'VERSION_CONFLICT') return
      const latest = await getEvent(event.id).catch(() => null)
      if (latest) cache.setQueryData([...eventKeys.detail(latest.id), session?.user.id], latest)
      if (latest && Boolean(latest[`${step}_done_at`]) === done) { setNotice(done ? 'Esta etapa já tinha sido concluída em outra aba.' : 'Esta etapa já tinha sido reaberta em outra aba.') }
      await cache.invalidateQueries({ queryKey: eventKeys.all })
    },
  })
  // O botão troca de lugar ao concluir ou reabrir: o foco vai para o aviso.
  useEffect(() => { if (notice) noticeRef.current?.focus() }, [notice])
  if (event.status !== 'published') return null
  const done = Boolean(event[`${step}_done_at`])
  const { label } = setupStepInfo[step]
  const order = step === 'guests' ? 1 : 2
  function mark(value: boolean) { if (sending.current) return; sending.current = true; setNotice(''); change.mutate(value) }
  // Conflito já resolvido pela outra aba (a etapa está como a pessoa pediu): sem erro.
  const resolved = (change.error as Error | null)?.message === 'VERSION_CONFLICT' && done === change.variables
  const error = change.error && !resolved && <p role="alert" className="error mt-3">{(change.error as Error).message === 'VERSION_CONFLICT' ? 'O evento mudou em outra aba. Os dados foram atualizados: tente de novo.' : errorMessage(change.error)}</p>
  const status = notice && <p ref={noticeRef} tabIndex={-1} role="status" className="state state-success mt-3">{notice}</p>
  if (done) return <div className="step-done">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="step-done-text"><span aria-hidden="true">✓ </span>Etapa concluída: {label.toLowerCase()}</p>
      <Button variant="ghost" size="sm" busy={change.isPending} onClick={() => mark(false)}>{change.isPending ? 'Reabrindo…' : 'Reabrir etapa'}</Button>
    </div>
    {status}{error}
  </div>
  return <section className="step-card" aria-labelledby={`step-${step}`}>
    <p className="eyebrow">Etapa {order} de 2</p>
    <h2 id={`step-${step}`} className="text-xl font-semibold">{label}</h2>
    <p className="mt-2 text-muted">{step === 'guests'
      ? 'Crie um convite para cada pessoa ou família e envie os links. Quando terminar, marque esta etapa.'
      : 'Monte a lista de fraldas e mimos que os convidados vão ver. Quando terminar, marque esta etapa.'}</p>
    <Button variant="secondary" className="mt-4" busy={change.isPending} onClick={() => mark(true)}>{change.isPending ? 'Salvando…' : `Concluí ${step === 'guests' ? 'convidados e presença' : 'a lista de presentes'}`}</Button>
    {status}{error}
  </section>
}
