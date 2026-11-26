# Gera as páginas a/<id>.html dos anúncios de EXEMPLO.
# Cada página tem a foto e o nome (Open Graph), para o WhatsApp mostrar a prévia, e manda a pessoa para o anúncio no app.
# Rodar de novo sempre que mudar os exemplos:  python3 ferramentas/gerar-compartilhar.py
import re, os, html
RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://viniciusquinalia-eng.github.io/app-pesca/'
s = open(os.path.join(RAIZ, 'index.html'), encoding='utf-8').read()
os.makedirs(os.path.join(RAIZ, 'a'), exist_ok=True)
n = 0
for linha in s.splitlines():
    m = re.match(r"\{id:'([a-z0-9]+)',", linha)
    if not m:
        continue
    g = lambda k: (re.search(k + r":'([^']*)'", linha) or [None, ''])[1]
    i = m.group(1)
    fotos = re.search(r'fotos:\[([^\]]*)\]', linha)
    lista = re.findall(r'"([^"]+)"', fotos.group(1)) if fotos else []
    foto = next((f for f in lista + [g('foto')] if os.path.exists(os.path.join(RAIZ, 'fotos/p', f + '.jpg'))), 'por-do-sol-represa')
    nome, cat, local, sub, preco, un = g('nome'), g('cat'), g('local'), g('sub'), g('preco'), g('un')
    desc = f"EXEMPLO · {cat} em {local}. {sub}" + (f" · {preco} por {un.strip('/')}" if preco.startswith('R$') and un else '')
    alvo = f"../?ad={i}#explorar"
    e = lambda t: html.escape(t, quote=True)
    pagina = f"""<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>{e(nome)} · Turma da Pesca</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Turma da Pesca">
<meta property="og:title" content="{e(nome)}">
<meta property="og:description" content="{e(desc)}">
<meta property="og:image" content="{BASE}fotos/p/{foto}.jpg">
<meta property="og:image:width" content="720"><meta property="og:image:height" content="540">
<meta property="og:url" content="{BASE}a/{i}.html">
<meta http-equiv="refresh" content="0;url={alvo}">
</head><body style="font-family:system-ui,sans-serif;font-size:18px;padding:24px">
<p><a href="{alvo}">Abrir {e(nome)} no Turma da Pesca</a></p>
</body></html>
"""
    open(os.path.join(RAIZ, 'a', i + '.html'), 'w', encoding='utf-8').write(pagina)
    n += 1
print(n, 'páginas geradas em a/')
