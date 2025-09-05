import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.44.2";

// --- ESTRUTURA ESPERADA DO PAYLOAD (EXEMPLO) ---
// É uma boa prática definir a "forma" do dado que você espera receber.
// Adapte esta interface de acordo com o payload real enviado pela Green.
interface GreenWebhookPayload {
  event_type: string; // Ex: "purchase.approved", "subscription.canceled"
  customer: {
    name: string;
    email: string;
  };
  // ... outras propriedades do payload
  [key: string]: any; // Permite outras propriedades não definidas
}

serve(async (req: Request) => {
  // 1. Validação do Método HTTP
  if (req.method !== "POST") {
    return new Response("Método não permitido", { status: 405 });
  }

  try {
    // 2. Leitura e Parsing do Corpo da Requisição
    const body: GreenWebhookPayload = await req.json();
    console.log("Webhook recebido:", body);

    // 3. Inicialização do Cliente Supabase com Variáveis de Ambiente
    //    IMPORTANTE: As variáveis "SUPABASE_URL" e "SUPABASE_SERVICE_ROLE_KEY"
    //    devem ser configuradas no seu projeto Supabase.
    const supabaseUrl = Deno.env.get("SUPABASE_URL"); // <-- CORRIGIDO AQUI
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Variáveis de ambiente do Supabase não configuradas.");
    }

    const client = createClient(supabaseUrl, supabaseServiceKey);

    // 4. Extração de Dados e Inserção Otimizada no Banco
    //    CORREÇÃO: O método .insert() espera um array de objetos.
    const { data, error } = await client
      .from("webhooks")
      .insert([{ // <--- O objeto agora está dentro de um array
        payload: body, // Ainda salvamos o payload completo para auditoria
        event: body.event_type || 'unknown_event', // Extrai o tipo de evento
        email: body.customer?.email || 'no_email', // Extrai o email do cliente
        status: 'received' // Define um status inicial
      }])
      .select() // O .select() retorna o registro inserido, útil para logs
      .single();

    // 5. Tratamento de Erro na Inserção
    if (error) {
      console.error("Erro ao inserir no Supabase:", error);
      // Lança o erro para ser pego pelo catch principal
      throw new Error(`Erro no banco de dados: ${error.message}`);
    }

    console.log("Dados inseridos com sucesso:", data);

    // 6. Resposta de Sucesso
    return new Response(JSON.stringify({ success: true, message: "Webhook processado", entryId: data.id }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    // 7. Resposta de Erro Genérico
    console.error("Erro na Edge Function:", err.message);
    return new Response(JSON.stringify({ success: false, message: err.message }), {
      status: 500, // Usamos 500 para erros de servidor
      headers: { "Content-Type": "application/json" },
    });
  }
});

