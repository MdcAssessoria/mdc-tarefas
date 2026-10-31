// Mensagem para lista vazia: diz o que está acontecendo e, se houver, qual é o próximo passo.

export function EstadoVazio({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="py-6 text-center text-sm text-neutral-500">
      <p>{children}</p>
      {acao && <div className="mt-3">{acao}</div>}
    </div>
  );
}
