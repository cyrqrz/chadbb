import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button, Field, SendIcon } from '../../components/ui'
import { SuccessMessage } from '../../components/States'
import { CONTACT } from '../../lib/contact'
import { readPublicConfig } from '../../lib/config'

// Mesmos assuntos e limites da Edge `contact` (supabase/functions/contact/handler.ts),
// que é quem decide: aqui a conferência só evita uma ida ao servidor à toa.
const topics = [['convite', 'Recebi um convite'], ['organizar', 'Organizo um evento'], ['dados', 'Meus dados e privacidade'], ['outro', 'Outro assunto']] as const
type FieldName = 'name' | 'email' | 'topic' | 'message' | 'details'
const fieldErrors: Record<FieldName, string> = {
  name: 'Informe seu nome.',
  email: 'Informe um e-mail válido para a resposta.',
  topic: 'Escolha um assunto.',
  message: 'Conte o que aconteceu em pelo menos 10 caracteres.',
  details: 'Os detalhes passaram do limite de 4.000 caracteres.',
}
const empty = { name: '', email: '', topic: '', message: '', details: '' }

async function sendContact(form: typeof empty & { website: string }) {
  const config = readPublicConfig(import.meta.env)
  if (config.status !== 'ready') throw new Error('TEMPORARILY_UNAVAILABLE')
  const response = await fetch(`${config.config.url}/functions/v1/contact`, {
    method: 'POST', cache: 'no-store', headers: { 'Content-Type': 'application/json', apikey: config.config.key }, body: JSON.stringify(form),
  })
  const data = await response.json().catch(() => null) as { error?: string; field?: FieldName } | null
  if (!response.ok) throw Object.assign(new Error(data?.error ?? 'TEMPORARILY_UNAVAILABLE'), { field: data?.field })
}

export function ContactForm() {
  const [form, setForm] = useState(empty)
  // Campo-armadilha: fora da tela e do Tab, só robôs preenchem.
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const refs = useRef<Partial<Record<FieldName, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>>({})
  const set = (name: FieldName) => (value: string) => { setForm(current => ({ ...current, [name]: value })); setErrors(current => ({ ...current, [name]: undefined })); setSent(false); setFailure(null) }
  function check() {
    const found: Partial<Record<FieldName, string>> = {}
    if (!form.name.trim()) found.name = fieldErrors.name
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) found.email = fieldErrors.email
    if (!form.topic) found.topic = fieldErrors.topic
    if (form.message.trim().length < 10) found.message = fieldErrors.message
    if (form.details.trim().length > 4000) found.details = fieldErrors.details
    return found
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    const found = check()
    setErrors(found)
    // Erro: o foco vai para o primeiro campo errado, que já anuncia a mensagem (aria-describedby).
    const first = (Object.keys(fieldErrors) as FieldName[]).find(name => found[name])
    if (first) { refs.current[first]?.focus(); return }
    if (!navigator.onLine) { setFailure('Sem conexão com a internet. Confira a conexão e tente de novo.'); return }
    sending.current = true; setBusy(true); setFailure(null)
    try {
      await sendContact({ ...form, website })
      setForm(empty); setSent(true)
    } catch (cause) {
      const { message, field } = cause as Error & { field?: FieldName }
      if (message === 'INVALID_FIELD' && field) { setErrors({ [field]: fieldErrors[field] }); refs.current[field]?.focus() }
      else setFailure(message === 'RATE_LIMITED' ? 'Muitas mensagens em pouco tempo. Aguarde alguns minutos e tente de novo.'
        : `Não foi possível enviar agora. Tente de novo em instantes ou escreva para ${CONTACT}.`)
    } finally { sending.current = false; setBusy(false) }
  }
  return <form className="contact-form" onSubmit={submit} noValidate>
    <div className="contact-form-row">
      <Field label="Seu nome" error={errors.name}>{props => <input {...props} ref={el => { refs.current.name = el }} autoComplete="name" maxLength={120} readOnly={busy} value={form.name} onChange={e => set('name')(e.target.value)} />}</Field>
      <Field label="E-mail para a resposta" error={errors.email}>{props => <input {...props} ref={el => { refs.current.email = el }} type="email" inputMode="email" autoComplete="email" maxLength={254} readOnly={busy} value={form.email} onChange={e => set('email')(e.target.value)} />}</Field>
    </div>
    <Field label="Assunto" error={errors.topic}>{props => <select {...props} ref={el => { refs.current.topic = el }} disabled={busy} value={form.topic} onChange={e => set('topic')(e.target.value)}>
      <option value="">Escolha um assunto</option>
      {topics.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>}</Field>
    <Field label="O que aconteceu?" hint="Conte com suas palavras o que você precisa ou o que deu errado." error={errors.message}>{props =>
      <textarea {...props} ref={el => { refs.current.message = el }} rows={4} maxLength={4000} readOnly={busy} value={form.message} onChange={e => set('message')(e.target.value)} />}</Field>
    <Field label="Detalhes (opcional)" hint="Ex.: nome do evento, se foi no celular ou no computador, o que aparecia na tela." error={errors.details}>{props =>
      <textarea {...props} ref={el => { refs.current.details = el }} rows={3} maxLength={4000} readOnly={busy} value={form.details} onChange={e => set('details')(e.target.value)} />}</Field>
    <div className="contact-trap" aria-hidden="true">
      <label>Site<input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} name="website" /></label>
    </div>
    <p id="contato-privacidade" className="hint">Sua mensagem vai direto para o nosso e-mail e não fica guardada no site.</p>
    <Button type="submit" className="self-start" busy={busy} aria-describedby="contato-privacidade"><SendIcon />{busy ? 'Enviando…' : 'Enviar mensagem'}</Button>
    {sent && <SuccessMessage>Mensagem enviada. Respondemos no e-mail que você informou.</SuccessMessage>}
    {failure && <p role="alert" className="error">{failure}</p>}
  </form>
}
