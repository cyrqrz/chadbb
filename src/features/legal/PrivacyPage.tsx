// Texto aprovado pelo titular em 30/09 (T4 de docs/DECISOES-PRODUTO-2026-09-30.md).
// Descreve o que o sistema faz: mudar retenção, dados ou fornecedores exige mudar aqui.
import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export const CONTACT = 'contato@chadbb.online'

export function PrivacyPage() {
  const { hash } = useLocation()
  // A página chega por import tardio: a âncora ainda não existia quando o navegador tentou rolar.
  useEffect(() => { if (hash) document.getElementById(hash.slice(1))?.scrollIntoView() }, [hash])
  return <section className="page max-w-3xl py-12">
    <p className="eyebrow">chadbb</p>
    <h1 className="page-title">Privacidade e termos</h1>
    <p className="mt-4">O chadbb é mantido por Leonardo Martins. Contato: <a className="text-link" href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>

    <h2 id="convidados" className="mt-10 text-h2 font-bold">Para convidados</h2>
    <ul className="mt-4 list-disc space-y-3 pl-5">
      <li><strong>Quem decide sobre seus dados:</strong> a família que organizou o evento cadastrou seu nome e enviou o convite. O chadbb guarda e processa esses dados em nome dela.</li>
      <li><strong>O que guardamos:</strong> o nome do convite, sua resposta e o número de pessoas, e os presentes que você reservar ou informar como comprados. O e-mail é pedido só se você escolher “Talvez”, serve apenas para um lembrete e é apagado quando deixa de ser necessário.</li>
      <li><strong>O que não fazemos:</strong> sem anúncios e sem rastreadores. Para evitar abusos, o endereço IP da conexão é guardado embaralhado por poucos minutos.</li>
      <li><strong>Por quanto tempo:</strong> até 30 dias depois do fim do evento. Depois, nome, respostas, presentes e e-mail são apagados de vez. As cópias de segurança são cifradas e expiram em até 30 dias depois disso.</li>
      <li><strong>Onde:</strong> banco de dados no Supabase (São Paulo), site e cópias de segurança na Cloudflare, envio de e-mails pela Resend. Alguns desses serviços podem usar servidores fora do Brasil.</li>
      <li><strong>Seus direitos:</strong> você pode pedir acesso, correção ou exclusão pelo contato acima ou com a família organizadora. Confirmamos com ela que o pedido é seu e apagamos o convite, as respostas e as reservas.</li>
    </ul>

    <h2 id="organizadores" className="mt-10 text-h2 font-bold">Para organizadores — termos de uso</h2>
    <ul className="mt-4 list-disc space-y-3 pl-5">
      <li>O chadbb está em fase de testes: é gratuito e funciona por convite. Pode mudar ou parar, e você será avisado com antecedência.</li>
      <li>Cadastre só quem você convidaria de qualquer forma e só o necessário. Não coloque dados sensíveis nas instruções.</li>
      <li>Você responde pelo conteúdo do evento. A imagem de capa fica acessível a quem tiver o endereço dela; use só imagens autorizadas.</li>
      <li>Seu e-mail é guardado para o login. Do evento, 30 dias depois do fim, ficam só o título e as datas. Para apagar sua conta, use o contato.</li>
      <li>Encerrar um evento não pode ser desfeito.</li>
      <li>Fazemos backup diário, mas não garantimos disponibilidade contínua.</li>
      <li>O chadbb não vende nem intermedia pagamentos. As compras de presentes são feitas diretamente nas lojas.</li>
    </ul>
  </section>
}
