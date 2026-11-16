# Guia do servidor

Endereço: **https://sc.hayahtraining.com**
Servidor: Hostinger VPS KVM 1 (Ubuntu 24.04, São Paulo)

## Como funciona, em uma frase

O servidor olha o GitHub a cada 2 minutos. Quando aparece uma versão nova,
ele monta a versão numa pasta separada, testa, e só então coloca no ar.
Se algo der errado, a versão anterior continua (ou volta) no ar sozinha.

---

## 1. Primeira instalação (uma vez só)

**Onde digitar os comandos:** no painel da Hostinger, abra o VPS e clique em
**Terminal do navegador** (botão no alto da página). Uma tela preta abre já
como administrador (root). Para colar, use o botão direito do mouse ou Ctrl+Shift+V.

**Passo 1 — criar a chave de leitura.** Cole e aperte Enter:

```bash
id assistente >/dev/null 2>&1 || useradd -m -s /bin/bash assistente; apt-get update -qq && apt-get install -y -qq git openssh-client >/dev/null && runuser -u assistente -- bash -c 'mkdir -p ~/.ssh && chmod 700 ~/.ssh && { [ -f ~/.ssh/id_ed25519 ] || ssh-keygen -q -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C servidor-assistente; } && printf "Host github.com\n  StrictHostKeyChecking accept-new\n" > ~/.ssh/config && chmod 600 ~/.ssh/config' && echo && echo "=== COPIE A LINHA ABAIXO ===" && cat /home/assistente/.ssh/id_ed25519.pub
```

No final aparece uma linha começando com `ssh-ed25519`. Copie a linha inteira.

**Passo 2 — cadastrar a chave no GitHub.** No repositório `assistente-pessoal`:
**Settings → Deploy keys → Add deploy key**. Título: `servidor`. Cole a linha
em *Key*. **Não** marque *Allow write access* (o servidor só lê). Clique em *Add key*.

**Passo 3 — instalar tudo.** De volta ao terminal da Hostinger, cole:

```bash
runuser -u assistente -- git clone git@github.com:isaiassardinha/assistente-pessoal.git /home/assistente/app && bash /home/assistente/app/infra/scripts/instalar.sh
```

Leva uns 5 a 10 minutos. Termina com a mensagem **PRONTO. Servidor instalado.**

---

## 2. Publicar uma versão nova

Não precisa fazer nada: depois que a versão é salva no GitHub, ela entra no ar
em até uns 5 minutos (2 de espera + o tempo de montar).

Para publicar na hora (terminal da Hostinger):

```bash
assistente-publicar --forcar
```

## 3. Ver se está tudo no ar

- No navegador: **https://sc.hayahtraining.com/api/saude** deve mostrar
  `"ok":true` e o código da versão.
- No terminal:

```bash
systemctl status assistente-site --no-pager        # o site está rodando?
journalctl -u assistente-publicar -n 30 --no-pager  # últimas publicações
cat /var/lib/assistente/versao-no-ar                # versão no ar
cat /var/lib/assistente/versao-com-erro 2>/dev/null # versão que falhou (se houver)
```

## 4. Senhas e chaves do sistema

Ficam em `/etc/assistente/` no servidor, **nunca** no GitHub.
O modelo do que precisa existir está em `.env.example` na raiz do projeto.
Para editar: `nano /etc/assistente/site.env`, salvar com Ctrl+O, sair com Ctrl+X,
e depois `assistente-publicar --forcar`.

## 5. Reconectar o WhatsApp

(será preenchido na etapa do robô)
