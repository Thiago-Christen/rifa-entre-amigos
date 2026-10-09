# Rifa entre amigos

Site: https://thiago-christen.github.io/rifa-entre-amigos/

Projeto gratuito Supabase: `ohpgwezeacxldhofmafl`, região São Paulo. O schema já foi aplicado no projeto hospedado; não execute novamente. `public/config.js` já está conectado ao banco, mas `reservationsEnabled` permanece `false` até concluir a autenticação anônima, criar o organizador e verificar o fluxo. Não receba pagamentos antes dessa ativação.

100 números (01 a 100), R$ 10 por número e total possível de R$ 1.000. Site estático em HTML/CSS/JavaScript para GitHub Pages, com persistência compartilhada no Supabase/PostgreSQL.

## Visualizar

Com Node.js instalado, execute `npm start` nesta pasta e abra http://127.0.0.1:4173. Não precisa instalar dependências. `npm run check` verifica a sintaxe.

Sem as duas configurações do Supabase, o site funciona em **demonstração**, com reservas salvas em localStorage apenas neste navegador e painel administrativo sem senha. Esse painel e os dados locais não são usados no modo conectado. Não receba pagamentos no modo demonstração.

## Ativar os dados compartilhados

1. Crie um projeto em https://supabase.com/dashboard.
2. Execute `supabase/schema.sql` no SQL Editor de um projeto novo, uma vez.
3. Em Authentication, habilite **Anonymous Sign-Ins**. Visitantes recebem uma identidade anônima automaticamente. Ative CAPTCHA/Turnstile no Supabase antes de abrir vendas em grande escala; a integração do desafio no formulário ainda precisa ser adicionada para usar essa proteção. O limite por identidade evita excesso numa mesma sessão, mas não impede abuso por criação de novas identidades. Não habilite CAPTCHA sem integrar o token no cadastro anônimo, pois isso bloqueará reservas.
4. Crie seu usuário administrador em Authentication > Users, com e-mail e senha. Copie seu UUID e execute no SQL Editor:

   ```sql
   insert into private.admins(user_id) values ('UUID-DO-USUARIO');
   ```

5. Edite `public/config.js`: título, prêmio, regras/data do sorteio, chave Pix, favorecido, URL do projeto e **publishable key** (`sb_publishable_...`) ou chave pública legada **anon**. Nunca coloque `service_role`, secret key ou senha no site ou no GitHub. No projeto já criado, a URL e a publishable key estão configuradas. Depois de habilitar o acesso anônimo e cadastrar o administrador, defina `reservationsEnabled: true`.
6. Entre na Área do organizador com sua conta para confirmar os Pix recebidos ou cancelar reservas. A autorização é conferida no banco; não há senha administrativa no JavaScript.

O estado dos números é consultado a cada 15 segundos. Reservas expiram após 24 horas e os números voltam a ficar disponíveis automaticamente; não é necessário cron. Os dados históricos permanecem no banco. Uma reserva expirada não pode ser confirmada: verifique o Pix e resolva com o participante antes de confirmar números já liberados. O comprador vê a instrução de pagamento após reservar, recuperável ao atualizar a mesma aba. Salve o código antes de fechar a aba, pois esta versão não oferece recuperação da identidade anônima após fechar a sessão do navegador.

O banco autoriza o comprador a ler suas reservas e o organizador a ler todas. A consulta pública mostra apenas número e estado. Escrita direta fica bloqueada; funções validam os dados e serializam reservas/confirmações por lock para impedir duplicidade. Somente o administrador cadastrado pode confirmar um pagamento. Nome e telefone não aparecem publicamente. Supabase e GitHub são serviços externos e suas condições de uso e limites devem ser conferidos nas respectivas contas.

## Publicar no GitHub Pages

1. Crie ou escolha um repositório no GitHub.
2. Envie esta pasta para a branch `main`, mantendo `.github/workflows/pages.yml`.
3. Em Settings > Pages > Build and deployment, escolha **GitHub Actions**.
4. Execute o workflow “Publicar rifa no GitHub Pages” ou envie um novo commit.
5. Abra a URL exibida pelo workflow, normalmente `https://SEU-USUARIO.github.io/SEU-REPOSITORIO/`.

O workflow publica **somente a pasta public**. Os caminhos relativos funcionam em um repositório do Pages. O SQL não vai para o site, mas estará no repositório; não coloque dados reais de compradores nele.

## Verificação antes de receber pagamentos

Teste a mesma rifa em dois navegadores diferentes: reserve um número num deles e confirme que aparece indisponível no outro após atualizar. Tente reservar o mesmo número ao mesmo tempo e confirme que apenas uma reserva tem sucesso. Confira que uma conta sem permissão não consegue usar o painel ou confirmar pagamentos. Confirme um Pix no painel e confira o estado “Pago” na página pública. A demonstração não valida a segurança nem a concorrência do banco remoto.

## Escopo

Pagamento via chave Pix, com confirmação manual. Não inclui processamento automático de pagamentos, QR Code Pix, envio de mensagens, sorteio automático ou verificação legal da modalidade da rifa. Prêmio, data e regras devem ser definidos pelo organizador antes da abertura. Ainda depende da configuração e publicação nas suas contas para funcionar online com dados reais.

Referências: [GitHub Pages com Actions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site), [funções de banco no Supabase](https://supabase.com/docs/guides/database/functions), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
