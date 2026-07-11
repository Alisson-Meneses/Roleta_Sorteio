# Girou! — roleta de sorteios

App web para criar roletas personalizadas (nomes, grupos, perguntas, números, o que precisar), com perfis de usuário, roletas salvas por perfil, física de giro com som e uma tela de resultado com confete. Não usa nenhum framework nem processo de build — é HTML, CSS e JavaScript puros, então roda direto no GitHub Pages.

## Estrutura

```
roleta-app/
├── index.html
├── css/
│   └── styles.css
└── js/
    └── app.js
```

## Como publicar no GitHub Pages

1. Crie um repositório novo no GitHub (ex: `roleta`).
2. Suba os arquivos desta pasta para a raiz do repositório (pode arrastar e soltar pela interface do GitHub, ou via git):
   ```
   git init
   git add .
   git commit -m "Girou! primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/roleta.git
   git push -u origin main
   ```
3. No repositório, vá em **Settings → Pages**.
4. Em **Source**, selecione a branch `main` e a pasta `/ (root)`.
5. Salve. Em alguns minutos o site estará em `https://SEU-USUARIO.github.io/roleta/`.

Não é preciso configurar nada além disso — não há backend, banco de dados ou variáveis de ambiente.

## Como funciona o login

Não existe servidor: cada perfil (usuário, senha com hash e nome de exibição) e cada roleta ficam salvos no **localStorage do navegador**, isto é, no aparelho/navegador de quem está usando. Isso serve para separar as roletas de cada pessoa que usa o mesmo computador, mas **não é um sistema de autenticação seguro para dados sensíveis** — qualquer pessoa com acesso ao navegador e a alguma familiaridade técnica pode inspecionar esses dados. Não recomendamos reaproveitar uma senha importante ali.

Consequências práticas:
- Um perfil criado no navegador do computador do trabalho não aparece no celular — os dados não sincronizam entre aparelhos.
- Limpar os dados do site no navegador (ou usar aba anônima) apaga os perfis e roletas salvos ali.

## Testando localmente

O recurso de hash de senha usa `crypto.subtle`, que exige um "contexto seguro" — ou seja, **não funciona abrindo o `index.html` direto com duplo clique** (protocolo `file://`). Para testar localmente, sirva a pasta com um servidor simples, por exemplo:

```
python3 -m http.server 8000
```

e acesse `http://localhost:8000`. No GitHub Pages (https) isso já funciona normalmente, sem nenhum passo extra.

## Funcionalidades

- Criar/entrar em perfis (armazenados localmente).
- Criar roletas com título e lista de itens (adicionar um a um, em lote colando várias linhas, ou usando modelos prontos: Sim/Não, números, dias da semana, grupos A–D).
- Editar e excluir roletas salvas.
- Girar a roleta com física de desaceleração realista, som de "tique" a cada divisão passada e uma fanfarra ao parar.
- Tela de resultado com confete, opção de girar novamente ou remover o item sorteado da roleta (útil para sorteios de eliminação, tipo "quem já saiu não concorre de novo").
- Histórico dos últimos sorteios de cada roleta.
- Totalmente responsivo, com estados de foco visíveis e respeito à preferência de "reduzir movimento" do sistema.

## Personalizar

- Paleta de cores dos gomos: `PALETTE` no topo de `js/app.js`.
- Cores gerais, tipografia e espaçamentos: variáveis no topo de `css/styles.css` (bloco `:root`).
- Modelos rápidos do editor: objeto `PRESETS` em `js/app.js`.
