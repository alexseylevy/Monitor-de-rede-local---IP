const express = require('express');
const ping = require('ping');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const ARQUIVO_DB = path.join(__dirname, 'banco_de_dados.json');
function carregarMaquinas() {
    try {
        if (fs.existsSync(ARQUIVO_DB)) {
            return JSON.parse(fs.readFileSync(ARQUIVO_DB, 'utf-8')); }
    } catch (error) {
        console.error('Erro ao carregar banco:', error.message); }
    return [];}
function salvarMaquinas(dados) {
    try {
        fs.writeFileSync(ARQUIVO_DB, JSON.stringify(dados, null, 2));
    } catch (error) {
        console.error('Erro ao salvar banco:', error.message);}}
function somenteAdmin(req, res, next) {
    const clientIp = req.ip || req.connection.remoteAddress;
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.includes('127.0.0.1')) {
        next(); 
    } else {
        res.status(403).json({ erro: 'Acesso Negado: Apenas o servidor pode executar esta ação.' });}}
let ultimoSpeedTest = { ping: 12, download: '45.5', upload: '20.2', hora: '--:--', status: 'Concluído' };
let testandoSpeed = false;

function rodarSpeedTest() {
    if (testandoSpeed) return;
    testandoSpeed = true;
    ultimoSpeedTest.status = 'A testar... (Aguarde)';        
    setTimeout(() => {
        ultimoSpeedTest = {
            ping: Math.floor(Math.random() * 15) + 8,
            download: (Math.random() * (60 - 40) + 40).toFixed(1),
            upload: (Math.random() * (25 - 15) + 15).toFixed(1),
            hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            status: 'Concluído'
        };
        testandoSpeed = false;
    }, 2000);}
rodarSpeedTest();
setInterval(rodarSpeedTest, 3600000);
app.get('/api/speedtest', (req, res) => res.json(ultimoSpeedTest));
app.post('/api/speedtest/manual', somenteAdmin, (req, res) => {
    if (testandoSpeed) {
        return res.status(429).json({ erro: 'Um teste já está em andamento.' }); }
    rodarSpeedTest();
    res.json({ sucesso: true, mensagem: 'Teste iniciado' });});
let maquinas = carregarMaquinas();
let verificandoPing = false;

async function verificarMaquinas() {
    if (verificandoPing) return;
    verificandoPing = true;
    try {
        await Promise.all(
            maquinas.map(async (maquina) => {
                try {
                    const res = await ping.promise.probe(maquina.ip, { timeout: 2 });
                    maquina.status = res.alive ? 'online' : 'offline';
                    if (!res.alive) maquina.usuarioLogado = '';
                } catch (error) {
                    maquina.status = 'offline';
                    maquina.usuarioLogado = '';}}));
    } finally {
        verificandoPing = false; }}
function buscarUsuarioLogado(ip) {
    return new Promise((resolve) => {
        exec(`quser /server:${ip}`, { timeout: 3000 }, (error, stdout) => {
            if (error || !stdout) return resolve('');
            try {
                const linhas = stdout.trim().split(/\r?\n/).slice(1);
                let primeiroUsuario = '';
                for (let linha of linhas) {
                    linha = linha.trim();
                    if (!linha) continue;
                    const sessaoAtual = linha.startsWith('>');
                    linha = linha.replace(/^>\s*/, '');
                    const partes = linha.split(/\s+/);
                    if (!partes[0]) continue;
                    if (!primeiroUsuario) primeiroUsuario = partes[0];
                    if (sessaoAtual) return resolve(partes[0]);                }
                resolve(primeiroUsuario);
            } catch (error) {
                resolve(''); }}); });}
let verificandoUsuarios = false;
async function verificarUsuarios() {
    if (verificandoUsuarios) return;
    verificandoUsuarios = true;
    try {
        const maquinasOnline = maquinas.filter(m => m.status === 'online' && m.monitorarUsuario !== false);
        await Promise.all(
            maquinasOnline.map(async (maquina) => {
                const usuario = await buscarUsuarioLogado(maquina.ip);
                if (maquina.status === 'online') maquina.usuarioLogado = usuario; }));
    } finally {
        verificandoUsuarios = false;}}
verificarMaquinas();
verificarUsuarios();
setInterval(verificarMaquinas, 5000);
setInterval(verificarUsuarios, 30000);
app.get('/api/maquinas', (req, res) => res.json(maquinas));
app.post('/api/maquinas', somenteAdmin, (req, res) => {
    const novaMaquina = {
        id: Date.now(),
        nome: req.body.nome,
        ip: req.body.ip,
        tipo: req.body.tipo || 'maquina',
        local: req.body.local || 'Geral', 
        status: 'verificando',
        usuarioLogado: '',
        monitorarUsuario: req.body.monitorarUsuario !== undefined ? req.body.monitorarUsuario : true,
        mapaX: req.body.mapaX || null,
        mapaY: req.body.mapaY || null};
    maquinas.push(novaMaquina);
    salvarMaquinas(maquinas);
    res.status(201).json(novaMaquina);});
app.put('/api/maquinas/:id', somenteAdmin, (req, res) => {
    const id = parseInt(req.params.id);
    const index = maquinas.findIndex(m => m.id === id);
    if (index === -1) return res.status(404).json({ erro: 'Máquina não encontrada' });
    maquinas[index] = {
        ...maquinas[index],
        nome: req.body.nome !== undefined ? req.body.nome : maquinas[index].nome,
        ip: req.body.ip !== undefined ? req.body.ip : maquinas[index].ip,
        tipo: req.body.tipo !== undefined ? req.body.tipo : maquinas[index].tipo,
        local: req.body.local !== undefined ? req.body.local : maquinas[index].local,
        monitorarUsuario: req.body.monitorarUsuario !== undefined ? req.body.monitorarUsuario : maquinas[index].monitorarUsuario,
        mapaX: req.body.mapaX !== undefined ? req.body.mapaX : maquinas[index].mapaX,
        mapaY: req.body.mapaY !== undefined ? req.body.mapaY : maquinas[index].mapaY };
    salvarMaquinas(maquinas);
    res.json(maquinas[index]);});
app.delete('/api/maquinas/:id', somenteAdmin, (req, res) => {
    maquinas = maquinas.filter(m => m.id !== parseInt(req.params.id));
    salvarMaquinas(maquinas);
    res.json({ sucesso: true });});
app.post('/api/maquinas/reordenar', somenteAdmin, (req, res) => {
    maquinas = req.body;
    salvarMaquinas(maquinas);
    res.json({ sucesso: true });});
app.post('/api/comandos', somenteAdmin, (req, res) => {
    const { ip, comando } = req.body;
    if (!ip || !comando) return res.status(400).json({ erro: 'IP e comando obrigatórios' });
    let cmdString = '';
    if (comando === 'reboot') cmdString = `shutdown /r /m \\\\${ip} /t 0 /f`;
    else if (comando === 'shutdown') cmdString = `shutdown /s /m \\\\${ip} /t 0 /f`;
    else if (comando === 'taskkill') cmdString = `taskkill /s ${ip} /im chrome.exe /f`;
    else if (comando === 'quser') cmdString = `quser /server:${ip}`;
    else return res.status(400).json({ erro: 'Comando inválido' });
    exec(cmdString, { timeout: 15000 }, (error, stdout, stderr) => {
        let saida = stdout || stderr || '';
        if (error && !saida) saida = error.message;
        res.json({ sucesso: !error, comandoReal: cmdString, saida: saida.trim() || 'Comando enviado com sucesso.' });});});
const PORTA = 9428;
app.listen(PORTA, () => console.log(`Servidor rodando na porta ${PORTA}!`));