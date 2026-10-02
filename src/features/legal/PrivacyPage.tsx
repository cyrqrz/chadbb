import { usePageTitle } from '../../lib/usePageTitle'
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { CONTACT } from '../../lib/contact'
import { ContactForm } from './ContactForm'

// Texto aprovado pelo titular em 30/09 (T4 de docs/DECISOES-PRODUTO-2026-09-30.md).
// Descreve o que o sistema faz: mudar retenção, dados ou fornecedores exige mudar aqui.
const UPDATED = '2 de outubro de 2026'

// Pergunta e resposta: quem chega pelo convite procura uma dúvida, não lê de cima a baixo.
const guestAnswers = [
  ['Quem decide sobre seus dados', 'A família que organizou o evento cadastrou seu nome e enviou o convite. O chadbb guarda e processa esses dados em nome dela.'],
  ['O que guardamos', 'O nome do convite, sua resposta e o número de pessoas, e os presentes que você reservar ou informar como comprados. O e-mail é pedido só se você escolher “Talvez”, serve apenas para um lembrete e é apagado quando deixa de ser necessário. O nome do convite aparece na prévia do link enviado pelo WhatsApp (título e imagem), para quem tiver o link; o WhatsApp pode guardar essa prévia.'],
  ['O que não fazemos', 'Sem anúncios e sem rastreadores. Para evitar abusos, o endereço IP da conexão é guardado embaralhado por poucos minutos.'],
  ['Por quanto tempo', 'Até 30 dias depois do fim do evento. Depois, nome, respostas, presentes e e-mail são apagados de vez. As cópias de segurança são cifradas e expiram em até 30 dias depois disso.'],
  ['Onde ficam', 'Banco de dados no Supabase (São Paulo), site e cópias de segurança na Cloudflare, envio de e-mails pela Resend. Alguns desses serviços podem usar servidores fora do Brasil.'],
  ['Seus direitos', 'Você pode pedir acesso, correção ou exclusão pelo contato abaixo ou com a família organizadora. Confirmamos com ela que o pedido é seu e apagamos o convite, as respostas e as reservas.'],
] as const

const organizerTerms = [
  'O chadbb está em fase de testes: é gratuito e funciona por convite. Pode mudar ou parar, e você será avisado com antecedência.',
  'Cadastre só quem você convidaria de qualquer forma e só o necessário. Não coloque dados sensíveis nas instruções.',
  'Você responde pelo conteúdo do evento. A imagem de capa e as artes da prévia do link (a do evento, com título, dia e horário, e a de cada convite, que também traz o nome do convidado) ficam acessíveis a quem tiver o endereço delas; use só imagens autorizadas.',
  'Seu e-mail é guardado para o login. Do evento, 30 dias depois do fim, ficam só o título e as datas. Para apagar sua conta, use o contato.',
  'Fazemos backup diário, mas não garantimos disponibilidade contínua.',
  'O chadbb não vende nem intermedia pagamentos. As compras de presentes são feitas diretamente nas lojas.',
]

export function PrivacyPage() {
  usePageTitle('Privacidade e termos')
  const { hash } = useLocation()
  // A página chega por import tardio: a âncora ainda não existia quando o navegador tentou rolar.
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [hash])
  return <div className="page">
    <header className="legal-hero">
      <h1 className="page-title">Privacidade e termos</h1>
      <p className="legal-promise">Guardamos só o necessário para o evento acontecer e apagamos tudo 30 dias depois dele.</p>
      <p className="hint mt-4">Atualizado em {UPDATED}.</p>
    </header>

    <div className="legal">
      <nav className="legal-nav" aria-label="Nesta página">
        <ul>
          <li><a className="nav-link" href="#convidados">Convidados</a></li>
          <li><a className="nav-link" href="#organizadores">Organizadores</a></li>
          <li><a className="nav-link" href="#contato">Contato</a></li>
        </ul>
      </nav>

      <div className="legal-body">
        <section id="convidados" className="legal-section" aria-labelledby="convidados-titulo">
          <h2 id="convidados-titulo" className="text-h2 font-bold">Para convidados</h2>
          <dl className="legal-qa">{guestAnswers.map(([question, answer]) =>
            <div key={question}><dt>{question}</dt><dd>{answer}</dd></div>)}
          </dl>
        </section>

        <section id="organizadores" className="legal-section" aria-labelledby="organizadores-titulo">
          <h2 id="organizadores-titulo" className="text-h2 font-bold">Termos para organizadores</h2>
          <p className="section-description mt-2">Ao criar um evento, você concorda com estes termos.</p>
          <ul className="legal-terms">{organizerTerms.map(term => <li key={term}>{term}</li>)}</ul>
        </section>

        <section id="contato" className="legal-contact" aria-labelledby="contato-titulo">
          <h2 id="contato-titulo" className="text-h3 font-bold">Fale com a gente</h2>
          <p>Dúvidas, problemas com um convite ou pedidos sobre seus dados. O chadbb é mantido por Leonardo Martins, e a resposta chega no e-mail que você informar.</p>
          <ContactForm />
          <p>Prefere o seu e-mail? <a className="text-link" href={`mailto:${CONTACT}`}>Escrever para {CONTACT}</a></p>
        </section>
      </div>
    </div>
  </div>
}
