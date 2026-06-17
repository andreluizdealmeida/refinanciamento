document.addEventListener('DOMContentLoaded', () => {
    // FAQ Accordion
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(question => {
        question.addEventListener('click', () => {
            const answer = question.nextElementSibling;
            const isActive = question.classList.contains('active');
            
            // Close all
            document.querySelectorAll('.faq-question').forEach(q => {
                q.classList.remove('active');
                q.nextElementSibling.style.maxHeight = null;
            });
            
            // Open clicked if it wasn't active
            if (!isActive) {
                question.classList.add('active');
                answer.style.maxHeight = answer.scrollHeight + "px";
            }
        });
    });

    // Multi-step Form Logic
    const form = document.getElementById('analysis-form');
    const steps = Array.from(document.querySelectorAll('.form-step'));
    const nextBtns = document.querySelectorAll('.btn-next');
    const prevBtns = document.querySelectorAll('.btn-prev');
    let currentStep = 0;

    // Mascara simples para WhatsApp
    const whatsappInput = document.getElementById('whatsapp');
    if(whatsappInput) {
        whatsappInput.addEventListener('input', function(e) {
            let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
            e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
        });
    }
    
    // Mascara simples para valor (R$)
    const valorParcelaInput = document.getElementById('valor_parcela');
    if(valorParcelaInput) {
        valorParcelaInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if(value) {
                value = (parseInt(value) / 100).toFixed(2) + '';
                value = value.replace(".", ",");
                value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
                e.target.value = "R$ " + value;
            } else {
                e.target.value = "";
            }
        });
    }

    const valorRecebidoInput = document.getElementById('valor_recebido');
    if(valorRecebidoInput) {
        valorRecebidoInput.addEventListener('input', function(e) {
            let value = e.target.value.replace(/\D/g, '');
            if(value) {
                value = (parseInt(value) / 100).toFixed(2) + '';
                value = value.replace(".", ",");
                value = value.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
                e.target.value = "R$ " + value;
            } else {
                e.target.value = "";
            }
        });
    }

    // Lógica do Scanner de PDF
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const scannerLoading = document.getElementById('scanner-loading');
    const scannerResultado = document.getElementById('scanner-resultado');
    const dadosExtraidos = document.getElementById('dados-extraidos');
    const btnEnviarWa = document.getElementById('btn-enviar-dados-wa');
    const btnNovoPdf = document.getElementById('btn-novo-pdf');
    
    let relatorioParaWhatsapp = "";

    function resetarScanner() {
        relatorioParaWhatsapp = "";
        if (fileInput) fileInput.value = "";
        if (dadosExtraidos) dadosExtraidos.innerHTML = "";
        if (dropZone) dropZone.style.display = 'block';
        if (scannerLoading) scannerLoading.style.display = 'none';
        if (scannerResultado) scannerResultado.style.display = 'none';
    }

    if (dropZone) {
        dropZone.addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                processarPDF();
            }
        });

        fileInput.addEventListener('change', () => {
            if (fileInput.files.length) {
                processarPDF();
            }
        });
    }

    async function processarPDF() {
        const file = fileInput.files[0];
        const arquivoPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        if (!arquivoPdf) {
            alert('Por favor, envie apenas arquivos em formato PDF.');
            return;
        }

        if (!window.pdfjsLib) {
            alert('O leitor de PDF não carregou. Verifique sua conexão com a internet e tente atualizar a página.');
            resetarScanner();
            return;
        }

        dropZone.style.display = 'none';
        scannerLoading.style.display = 'block';
        scannerResultado.style.display = 'none';

        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            
            // ====== EXTRAÇÃO ROBUSTA DE TEXTO DO PDF ======
            // O pdf.js retorna fragmentos com coordenadas (X, Y).
            // Tabelas do INSS têm colunas cujas células ficam em Y levemente diferentes.
            // Solução: agrupar fragmentos por FAIXA de Y (±12px) = mesma linha visual.
            // Depois ordenar por X dentro de cada faixa = ordem de leitura esquerda→direita.

            let todosItens = []; // {text, x, y, page}
            let textoSequencial = "";
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageHeight = (await page.getViewport({scale:1})).height;
                textContent.items.forEach(item => {
                    if (item.str.trim().length > 0) {
                        textoSequencial += item.str + (item.hasEOL ? "\n" : " ");
                        todosItens.push({
                            text: item.str,
                            x: item.transform[4],
                            // Inverte Y (pdf.js usa Y de baixo pra cima) e separa páginas
                            y: (i - 1) * 10000 + (pageHeight - item.transform[5]),
                        });
                    }
                });
            }

            if (todosItens.length < 5) {
                throw new Error('PDF_SEM_TEXTO');
            }

            // Ordena por Y crescente (de cima pra baixo), depois X (esquerda pra direita)
            todosItens.sort((a, b) => a.y - b.y || a.x - b.x);

            // Agrupa em linhas visuais: itens com Y dentro de ±12px são a mesma linha
            const linhasVisuais = [];
            let linhaAtual = [];
            let yAtual = todosItens.length > 0 ? todosItens[0].y : 0;

            todosItens.forEach(item => {
                if (Math.abs(item.y - yAtual) > 12) {
                    if (linhaAtual.length > 0) {
                        // Ordena por X e junta os textos
                        linhaAtual.sort((a, b) => a.x - b.x);
                        linhasVisuais.push(linhaAtual.map(i => i.text).join(' '));
                    }
                    linhaAtual = [];
                    yAtual = item.y;
                }
                linhaAtual.push(item);
            });
            if (linhaAtual.length > 0) {
                linhaAtual.sort((a, b) => a.x - b.x);
                linhasVisuais.push(linhaAtual.map(i => i.text).join(' '));
            }

            const linhasSequenciais = textoSequencial
                .split(/\r?\n/)
                .map(l => l.trim())
                .filter(l => l.length > 0);

            const linhasBase = Array.from(new Set([...linhasVisuais, ...linhasSequenciais]));

            // Texto corrido (fallback) e linhas em maiúsculas
            const fullText = linhasBase.join(' ').toUpperCase();
            const linhasArray = linhasBase.map(l => l.toUpperCase().trim()).filter(l => l.length > 0);

            // Log para debug (abra o Console do navegador com F12 para verificar)
            console.log("=== SCANNER INSS - LINHAS RECONSTRUÍDAS ===");
            linhasArray.forEach((l, i) => console.log(`L${i}: ${l}`));

            // ====== 1. EXTRAIR NOME ======
            let nomeCliente = "Não identificado";

            for (const linha of linhasArray) {
                // Estratégia A: Linha que contém CPF formatado (XXX.XXX.XXX-XX)
                const cpfNaLinha = linha.match(/(\d{3}\.\d{3}\.\d{3}[\-\/]\d{2})/);
                if (cpfNaLinha) {
                    const partes = linha.split(cpfNaLinha[0]);
                    // Pega texto ANTES do CPF
                    let candidato = partes[0].replace(/(?:NOME|SEGURADO|BENEFICI[AÁ]RIO|TITULAR|CPF|NIT|NB|ESP[EÉ]CIE|MAT[RÍ]CULA|[\:\-\d])/gi, '').trim();
                    if (candidato.length >= 5 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+$/.test(candidato)) {
                        nomeCliente = candidato;
                        break;
                    }
                    // Pega texto DEPOIS do CPF (em alguns layouts o nome vem depois)
                    if (partes[1]) {
                        candidato = partes[1].replace(/(?:NOME|SEGURADO|BENEFICI[AÁ]RIO|TITULAR|CPF|NIT|NB|ESP[EÉ]CIE|[\:\-\d])/gi, '').trim();
                        if (candidato.length >= 5 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]+$/.test(candidato)) {
                            nomeCliente = candidato;
                            break;
                        }
                    }
                }
            }
            // Estratégia B: Busca textual por "Nome" seguido de texto
            if (nomeCliente === "Não identificado") {
                for (const linha of linhasArray) {
                    const nomeMatch = linha.match(/(?:NOME(?:\sDO\sSEGURADO|\sDO\sBENEFICI[AÁ]RIO)?|TITULAR)[\s\:]+([A-ZÁÉÍÓÚÂÊÔÃÕÇ\s]{5,60})/);
                    if (nomeMatch && !nomeMatch[1].includes("INSS") && !nomeMatch[1].includes("SEGURADO")) {
                        nomeCliente = nomeMatch[1].trim();
                        break;
                    }
                }
            }

            // ====== 2. EXTRAIR SALÁRIO / BENEFÍCIO ======
            let salarioLiquido = "Não identificado";
            const keywordsSalario = /(?:BASE DE C[AÁ]LCULO|VALOR DO BENEF[IÍ]CIO|SAL[AÁ]RIO|MARGEM|RENDA MENSAL|VALOR MENSAL|COMPET[EÊ]NCIA)/;
            
            for (let idx = 0; idx < linhasArray.length; idx++) {
                const linha = linhasArray[idx];
                if (keywordsSalario.test(linha)) {
                    // Busca valor na mesma linha
                    const valoresNaLinha = linha.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
                    if (valoresNaLinha) {
                        // Filtra 0,00 e pega o primeiro valor relevante
                        const valido = valoresNaLinha.find(v => parseFloat(v.replace(/\./g,'').replace(',','.')) > 1);
                        if (valido) { salarioLiquido = "R$ " + valido; break; }
                    }
                    // Se não achou na mesma linha, verifica as próximas 3 linhas
                    for (let j = 1; j <= 3 && (idx + j) < linhasArray.length; j++) {
                        const proxLinha = linhasArray[idx + j];
                        const valoresProx = proxLinha.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/g);
                        if (valoresProx) {
                            const valido = valoresProx.find(v => parseFloat(v.replace(/\./g,'').replace(',','.')) > 1);
                            if (valido) { salarioLiquido = "R$ " + valido; break; }
                        }
                    }
                    if (salarioLiquido !== "Não identificado") break;
                }
            }

            // ====== 3. OPERAÇÕES COM VALORES ======
            const opsAverbacao = [];
            const opsRefin = [];
            const opsPortab = [];

            const normalizarTexto = (texto) => texto
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .toUpperCase();

            const linhasNormalizadas = linhasBase.map(l => normalizarTexto(l)).filter(Boolean);
            const valorRegex = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}/g;
            const temValorRegex = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}/;
            const contratoRegex = /\b(?:CONTRATO|NR\.?\s*CONTRATO|NUMERO\s+DO\s+CONTRATO|ADE|AVERBACAO)\b/;
            const tipoAverbacaoRegex = /\b(?:AVERBACAO|EMPRESTIMO|NOVO|CONSIGNADO)\b/;
            const tipoRefinRegex = /\b(?:REFIN|REFINANCIAMENTO|REPACTUACAO|RENOVACAO)\b/;
            const tipoPortabRegex = /\b(?:PORTABILIDADE|PORTADO)\b/;
            const rotulosIgnoradosRegex = /\b(?:MARGEM|DISPONIVEL|RESERVADA|BENEFICIO|SALARIO|BASE|TOTAL|CET|JUROS|TAXA)\b/;
            const numeroContratoRegex = /\b\d{6,}\b/;

            const limparValor = (valor) => {
                const limpo = valor.replace(/R\$\s*/i, '').trim();
                return `R$ ${limpo}`;
            };

            const valoresDaJanela = (texto) => {
                const encontrados = texto.match(valorRegex) || [];
                return encontrados
                    .map(limparValor)
                    .filter((valor, indice, lista) => lista.indexOf(valor) === indice);
            };

            const escolherValorParcela = (texto) => {
                const partes = texto.split(/\b(?:PARCELA|VALOR\s+DA\s+PARCELA|VALOR\s+EMPRESTIMO|VALOR\s+LIBERADO|CONTRATO)\b/);
                const trechoPreferido = partes.length > 1 ? partes.slice(1).join(' ') : texto;
                const valores = valoresDaJanela(trechoPreferido);
                if (valores.length > 0) return valores[0];
                const fallback = valoresDaJanela(texto);
                return fallback[0] || "Valor não lido";
            };

            const adicionarOperacao = (tipo, valor) => {
                if (tipo === 'refin') opsRefin.push(valor);
                else if (tipo === 'portab') opsPortab.push(valor);
                else opsAverbacao.push(valor);
            };

            const extrairNumeroContrato = (texto) => {
                const comRotulo = texto.match(/\b(?:CONTRATO|ADE)\D{0,25}(\d{6,})\b/);
                if (comRotulo) return comRotulo[1];
                const qualquerNumeroLongo = texto.match(numeroContratoRegex);
                return qualquerNumeroLongo ? qualquerNumeroLongo[0] : "";
            };

            const janelasProcessadas = new Set();

            for (let idx = 0; idx < linhasNormalizadas.length; idx++) {
                const linha = linhasNormalizadas[idx];
                const contexto = linhasNormalizadas.slice(idx, idx + 8).join(' ');
                const temOperacao = tipoAverbacaoRegex.test(contexto) || tipoRefinRegex.test(contexto) || tipoPortabRegex.test(contexto);
                const temContratoOuValor = contratoRegex.test(contexto) || temValorRegex.test(contexto);
                const linhaPodeIniciarContrato = contratoRegex.test(linha) || tipoAverbacaoRegex.test(linha) || tipoRefinRegex.test(linha) || tipoPortabRegex.test(linha) || numeroContratoRegex.test(linha);

                if (!linhaPodeIniciarContrato || !temOperacao || !temContratoOuValor || rotulosIgnoradosRegex.test(linha) && !contratoRegex.test(contexto)) continue;

                let tipoDetectado = 'averb';
                if (tipoRefinRegex.test(contexto)) tipoDetectado = 'refin';
                else if (tipoPortabRegex.test(contexto)) tipoDetectado = 'portab';

                const numeroContrato = extrairNumeroContrato(contexto);
                const valorParcela = escolherValorParcela(contexto);
                const chave = numeroContrato ? `${tipoDetectado}-${numeroContrato}` : `${tipoDetectado}-${valorParcela}-${idx}`;
                if (janelasProcessadas.has(chave)) continue;
                janelasProcessadas.add(chave);

                adicionarOperacao(tipoDetectado, valorParcela);
            }

            const totalOperacoes = opsAverbacao.length + opsRefin.length + opsPortab.length;

            let htmlResultado = `<p>Leitura concluída. Veja os dados extraídos do seu documento:</p><ul style="font-size: 1.1rem; line-height: 1.8;">`;
            let txtWa = "*RELATÓRIO AUTOMÁTICO - SCANNER INSS (HISCON)*\n\n";
            txtWa += "Olá, gostaria de solicitar uma análise jurídica preliminar dos dados encontrados no meu extrato de empréstimos consignados do INSS.\n\n";

            htmlResultado += `<li>👤 Nome do Titular: <strong>${nomeCliente}</strong></li>`;
            htmlResultado += `<li>💰 Salário / Benefício Base: <strong>${salarioLiquido}</strong></li>`;
            
            txtWa += `- Nome do titular: ${nomeCliente}\n`;
            txtWa += `- Salário/benefício base: ${salarioLiquido}\n\n`;
            txtWa += `*OPERAÇÕES IDENTIFICADAS:*\n`;

            if (totalOperacoes > 0) {
                // Formatação para exibição
                const renderOps = (nome, array) => {
                    if (array.length === 0) return "";
                    let itens = array.map(v => `<span style="display:inline-block; background:#e0e0e0; padding:2px 8px; border-radius:12px; font-size:0.9rem; margin-right:5px;">${v}</span>`).join('');
                    return `<li>📄 ${nome} (${array.length}): <br>${itens}</li>`;
                };
                
                const renderOpsWa = (nome, array) => {
                    if (array.length === 0) return "";
                    // Filtra "Valor não lido" para a mensagem do WhatsApp ficar limpa
                    const valoresReais = array.filter(v => v !== "Valor não lido");
                    const naoLidos = array.length - valoresReais.length;
                    let texto = `- ${nome} (${array.length})`;
                    if (valoresReais.length > 0) texto += `: ${valoresReais.join(' / ')}`;
                    if (naoLidos > 0) texto += ` (${naoLidos} sem valor lido)`;
                    return texto + `\n`;
                };

                htmlResultado += renderOps("Empréstimos Novos (Averbações)", opsAverbacao);
                if(opsRefin.length > 0) {
                    let itensRefin = opsRefin.filter(v => v !== "Valor não lido").map(v => `<span style="display:inline-block; background:#ffebeb; color:var(--error-color); padding:2px 8px; border-radius:12px; font-size:0.9rem; margin-right:5px; border: 1px solid var(--error-color);">${v}</span>`).join('');
                    if (!itensRefin) itensRefin = '<span style="font-size:0.9rem;">Valores não lidos automaticamente</span>';
                    htmlResultado += `<li>🔄 Refinanciamentos (<strong style="color:var(--error-color)">${opsRefin.length}</strong>): <br>${itensRefin}</li>`;
                }
                htmlResultado += renderOps("Portabilidades", opsPortab);
                
                txtWa += renderOpsWa("Averbação", opsAverbacao);
                txtWa += renderOpsWa("Refinanciamento", opsRefin);
                txtWa += renderOpsWa("Portabilidade", opsPortab);

                if (opsRefin.length > 0) {
                    htmlResultado += "</ul><p style='margin-top:15px; color: var(--error-color); font-weight: bold;'>Atenção: O sistema identificou contratos de Refinanciamento com esses valores acima. Esta é a modalidade que os bancos mais utilizam para cobrar juros abusivos.</p>";
                    txtWa += "\n🚨 *Alerta do sistema:* foram identificados refinanciamentos. Gostaria que a equipe verificasse se houve falha no dever de informação ou alguma irregularidade.";
                } else {
                    htmlResultado += "</ul><p style='margin-top:15px;'>Vamos analisar detalhadamente esses valores para verificar se há falha de informação ou cobrança indevida.</p>";
                }
            } else {
                htmlResultado += "<li>🔍 O PDF foi processado, mas as operações não puderam ser listadas automaticamente (formato desconhecido).</li></ul><p style='margin-top:15px;'>Nossa equipe fará a verificação visual no documento.</p>";
                txtWa += "Nenhuma operação foi classificada automaticamente. Solicito revisão humana do documento.";
            }

            htmlResultado += "<p class='scanner-note'>Importante: a leitura automática ajuda na triagem, mas não substitui a conferência jurídica dos documentos. Se algum dado aparecer incompleto, envie mesmo assim para revisão humana.</p>";

            // Exibir na tela
            dadosExtraidos.innerHTML = htmlResultado;
            relatorioParaWhatsapp = txtWa;

            setTimeout(() => {
                scannerLoading.style.display = 'none';
                scannerResultado.style.display = 'block';
            }, 1500); // Dá um tempinho extra na animação para gerar efeito Wow

        } catch (error) {
            console.error("Erro ao ler PDF:", error);
            const mensagemErro = error.message === 'PDF_SEM_TEXTO'
                ? 'O PDF parece ser uma imagem escaneada ou não possui texto pesquisável. Nesse caso, a leitura automática não consegue extrair os dados, mas a equipe pode analisar o documento manualmente.'
                : 'Ocorreu um erro ao tentar ler o arquivo PDF. Ele pode estar protegido com senha, corrompido ou em um formato incompatível.';
            alert(mensagemErro);
            scannerLoading.style.display = 'none';
            dropZone.style.display = 'block';
            if (fileInput) fileInput.value = "";
        }
    }

    if (btnEnviarWa) {
        btnEnviarWa.addEventListener('click', () => {
            if (!relatorioParaWhatsapp.trim()) {
                alert('Envie um PDF primeiro para gerar o relatório automático.');
                return;
            }
            const numeroWhatsApp = "5562994030708"; 
            const urlWhatsApp = `https://api.whatsapp.com/send?phone=${numeroWhatsApp}&text=${encodeURIComponent(relatorioParaWhatsapp)}`;
            window.open(urlWhatsApp, '_blank');
        });
    }

    if (btnNovoPdf) {
        btnNovoPdf.addEventListener('click', resetarScanner);
    }

    function showStep(index) {
        steps.forEach((step, i) => {
            step.classList.toggle('active', i === index);
        });
        
        // Scroll para o topo do formulário suavemente
        const formSection = document.getElementById('analise');
        if (formSection) {
            window.scrollTo({
                top: formSection.offsetTop - 50,
                behavior: 'smooth'
            });
        }
    }

    function validateStep(index) {
        const currentStepEl = steps[index];
        const inputs = currentStepEl.querySelectorAll('input[required], select[required]');
        let isValid = true;
        
        inputs.forEach(input => {
            if (!input.value.trim()) {
                isValid = false;
                input.style.borderColor = 'var(--error-color)';
                
                // Remove erro ao digitar
                input.addEventListener('input', function removeError() {
                    input.style.borderColor = 'var(--border-color)';
                    input.removeEventListener('input', removeError);
                });
            }
        });
        
        if (!isValid) {
            alert('Por favor, preencha todos os campos obrigatórios marcados antes de prosseguir.');
        }
        
        return isValid;
    }

    nextBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if (validateStep(currentStep)) {
                currentStep++;
                if (currentStep >= steps.length) {
                    currentStep = steps.length - 1;
                }
                showStep(currentStep);
            }
        });
    });

    prevBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            currentStep--;
            if (currentStep < 0) {
                currentStep = 0;
            }
            showStep(currentStep);
        });
    });

    // Form Submission (WhatsApp Redirect)
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        if (!validateStep(currentStep)) return;
        
        const consent = document.getElementById('consentimento').checked;
        if (!consent) {
            alert('Você precisa concordar com os termos de consentimento para enviar.');
            return;
        }

        // Coleta de dados
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Coletar múltiplos checkboxes (vulnerabilidade, assinatura, promessa, documentos)
        const getCheckedValues = (name) => {
            return Array.from(form.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value).join(', ') || 'Nenhum informado';
        };

        const vulnerabilidades = getCheckedValues('vulnerabilidade');
        const assinaturas = getCheckedValues('assinatura');
        const promessas = getCheckedValues('promessa');
        const documentos = getCheckedValues('documentos');

        // Formatação da mensagem para o WhatsApp
        const mensagemTexto = `
*SOLICITAÇÃO DE ANÁLISE PRELIMINAR - CONSIGNADO*

Olá, gostaria de solicitar uma análise jurídica preliminar sobre possível problema com empréstimo ou refinanciamento consignado.

*1. Dados de contato*
Nome: ${data.nome}
WhatsApp: ${data.whatsapp}
Cidade/UF: ${data.cidade_estado}
O caso é: ${data.titularidade}

*2. Titular do benefício*
Nome do titular: ${data.nome_titular}
Idade: ${data.idade_titular}
Tipo de benefício: ${data.tipo_beneficio}
Situação/vulnerabilidade: ${vulnerabilidades}

*3. Dados do desconto*
Banco responsável pelo desconto: ${data.banco}
Valor da parcela: ${data.valor_parcela}
Início aproximado dos descontos: ${data.data_inicio || 'Não informado'}
O desconto ainda está ativo?: ${data.desconto_ativo}
Modalidade informada no extrato: ${data.modalidade}

*4. Como ocorreu a contratação*
Canal de contratação: ${data.canal_contratacao}
Meios exigidos para assinatura/confirmação: ${assinaturas}
O que foi prometido: ${promessas}
Sabia que se tratava de refinanciamento?: ${data.sabia_refinanciamento}

*5. Valores e documentos*
Valor recebido como troco: ${data.valor_recebido || 'Não informado'}
O banco/vendedor explicou o saldo anterior e o CET?: ${data.explicacao_banco}
Recebeu cópia do contrato antes do aceite?: ${data.contrato_previo}
Documentos em mãos: ${documentos}

Estou ciente de que esta é uma triagem preliminar e que a análise depende dos documentos e das informações apresentadas.
        `;

        // Substitua pelo número de WhatsApp do escritório (apenas números, com DDI e DDD, ex: 5562999999999)
        const numeroWhatsApp = "5562994030708"; 
        
        const urlWhatsApp = `https://api.whatsapp.com/send?phone=${numeroWhatsApp}&text=${encodeURIComponent(mensagemTexto.trim())}`;
        
        // Abre em nova aba
        window.open(urlWhatsApp, '_blank');
        
        // Opcional: mostrar mensagem de sucesso
        form.innerHTML = `<div style="text-align:center; padding: 40px 0;">
            <h3 style="color: var(--success-color); font-size: 1.5rem; margin-bottom: 15px;">✅ Solicitação Enviada!</h3>
            <p>Seus dados foram preparados e enviados para o nosso WhatsApp. Nossa equipe realizará a triagem e entrará em contato em breve.</p>
        </div>`;
    });
});
