import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js';

window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) {
        console.error("Canvas não encontrado!");
        return;
    }
    const ctx = canvas.getContext('2d');

    // Ajuste dinâmico de redimensionamento de tela
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const car = {
        x: 0,
        y: 200,
        width: 28,
        height: 56,
        angle: 0,
        moveAngle: 0,
        speed: 0,
        maxSpeed: 16,
        acceleration: 0.16,
        braking: 0.5,
        friction: 0.035,
        turnSpeed: 0.042,
        grip: 0.12,
        gear: 1
    };

    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);

    const skidMarks = [];
    const particles = []; // Sistema de partículas para fumaça/pó

    // Sistema de Áudio Sintetizado (Motor e Pneus)
    let audioCtx = null;
    let engineOsc = null;
    let engineGain = null;
    let audioInitialized = false;

    function initAudio() {
        if (audioInitialized) return;
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            engineOsc = audioCtx.createOscillator();
            engineOsc.type = 'sawtooth';
            engineOsc.frequency.setValueAtTime(60, audioCtx.currentTime);
            
            engineGain = audioCtx.createGain();
            engineGain.gain.setValueAtTime(0.04, audioCtx.currentTime);
            
            engineOsc.connect(engineGain);
            engineGain.connect(audioCtx.destination);
            engineOsc.start();
            audioInitialized = true;
        } catch (e) {
            console.warn("Áudio restrito pelo navegador:", e);
        }
    }

    window.addEventListener('keydown', initAudio, { once: true });
    window.addEventListener('click', initAudio, { once: true });

    function updateAudio() {
        if (!audioInitialized || !audioCtx || !engineOsc) return;
        try {
            let targetFreq = 55 + (Math.abs(car.speed) / car.maxSpeed) * 280;
            engineOsc.frequency.setTargetAtTime(targetFreq, audioCtx.currentTime, 0.1);
        } catch (e) {}
    }

    // Câmera Estilo PS2 (Com zoom dinâmico baseado na velocidade)
    const camera = {
        x: 0,
        y: 0,
        zoom: 1,
        update(target) {
            let targetX = target.x - canvas.width / 2;
            let targetY = target.y - canvas.height / 2;
            
            this.x += (targetX - this.x) * 0.1;
            this.y += (targetY - this.y) * 0.1;

            // Afasta a câmara ligeiramente em velocidades altas para dar sensação de IMAX/PS2
            let targetZoom = 1 - (Math.abs(car.speed) / car.maxSpeed) * 0.15;
            this.zoom += (targetZoom - this.zoom) * 0.05;
        }
    };

    function update() {
        // Aceleração / Ré
        if (keys['ArrowUp'] || keys['KeyW']) {
            car.speed += car.acceleration;
            if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
        } else if (keys['ArrowDown'] || keys['KeyS']) {
            car.speed -= car.braking;
            if (car.speed < -car.maxSpeed / 3) car.speed = -car.maxSpeed / 3;
        } else {
            if (car.speed > 0) {
                car.speed -= car.friction;
                if (car.speed < 0) car.speed = 0;
            } else if (car.speed < 0) {
                car.speed += car.friction;
                if (car.speed > 0) car.speed = 0;
            }
        }

        // Simulação de marchas (1 a 7)
        if (car.speed === 0) car.gear = 1;
        else car.gear = Math.min(7, Math.floor(Math.abs(car.speed) / (car.maxSpeed / 7)) + 1);

        // Direção
        if (Math.abs(car.speed) > 0.5) {
            const speedFactor = Math.min(Math.abs(car.speed) / car.maxSpeed, 1);
            const directionFactor = car.speed > 0 ? 1 : -1;

            if (keys['ArrowLeft'] || keys['KeyA']) car.angle -= car.turnSpeed * speedFactor * directionFactor;
            if (keys['ArrowRight'] || keys['KeyD']) car.angle += car.turnSpeed * speedFactor * directionFactor;
        }

        // Física de Inércia / Grip dos Pneus
        let angleDifference = car.angle - car.moveAngle;
        car.moveAngle += angleDifference * car.grip;

        // Geração de marcas de pneus e partículas de fumaça nas curvas fechadas
        if (Math.abs(angleDifference) > 0.18 && Math.abs(car.speed) > 4) {
            skidMarks.push({ x: car.x, y: car.y, alpha: 0.5 });
            if (skidMarks.length > 200) skidMarks.shift();

            // Partículas de fumaça nas rodas traseiras
            particles.push({
                x: car.x - Math.sin(car.moveAngle) * 20,
                y: car.y + Math.cos(car.moveAngle) * 20,
                size: Math.random() * 6 + 4,
                alpha: 0.4
            });
        }

        // Atualiza partículas de fumaça
        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].alpha -= 0.02;
            particles[i].size += 0.2;
            if (particles[i].alpha <= 0) particles.splice(i, 1);
        }

        // Traçado da Pista com curvas em "S" mais complexas (Fórmula 1 layout)
        const trackCenterX = Math.sin(car.y / 600) * 550 + Math.cos(car.y / 1200) * 300;
        const distanceFromCenter = Math.abs(car.x - trackCenterX);
        
        if (distanceFromCenter > 280) {
            car.speed *= 0.93; // Fora da pista (relva) reduz a velocidade drasticamente
        }

        car.x += Math.sin(car.moveAngle) * car.speed;
        car.y -= Math.cos(car.moveAngle) * car.speed;

        camera.update(car);
        updateAudio();
    }

    function drawTrack() {
        // Fundo de relva com tom clássico
        ctx.fillStyle = '#285228';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        // Aplica o sistema de câmara com zoom dinâmico
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        ctx.translate(-camera.x - canvas.width / 2, -camera.y - canvas.height / 2);

        // Renderiza o circuito em segmentos verticais fluidos
        for (let y = car.y - 1200; y < car.y + 1500; y += 40) {
            let centerX = Math.sin(y / 600) * 550 + Math.cos(y / 1200) * 300;

            // Asfalto principal
            ctx.fillStyle = '#242424';
            ctx.fillRect(centerX - 300, y, 600, 42);

            // Linha central pontilhada
            ctx.fillStyle = '#ffffff';
            if (Math.floor(y / 40) % 2 === 0) {
                ctx.fillRect(centerX - 4, y, 8, 20);
            }

            // Zebras clássicas nas bermas (Branco e Vermelho)
            ctx.fillStyle = (Math.floor(y / 40) % 2 === 0) ? '#ffffff' : '#e60000';
            ctx.fillRect(centerX - 312, y, 12, 42);
            ctx.fillRect(centerX + 300, y, 12, 42);
        }

        // Marcas de pneus no asfalto
        skidMarks.forEach(mark => {
            ctx.fillStyle = `rgba(10, 10, 10, ${mark.alpha})`;
            ctx.fillRect(mark.x - 2, mark.y - 2, 5, 5);
        });

        // Partículas de fumaça
        particles.forEach(p => {
            ctx.fillStyle = `rgba(220, 220, 220, ${p.alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    }

    function drawCar() {
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(camera.zoom, camera.zoom);
        
        // Posição relativa à câmara do carro
        let renderX = car.x - camera.x - canvas.width / 2;
        let renderY = car.y - camera.y - canvas.height / 2;
        
        ctx.translate(renderX + canvas.width / 2, renderY + canvas.height / 2);
        ctx.rotate(car.angle);

        // Sombreamento sob o carro (Efeito 3D subtil de PS2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(-car.width / 2 - 3, -car.height / 2 + 5, car.width + 6, car.height);

        // Corpo do Carro de F1 (Azul equipa clássica)
        ctx.fillStyle = '#0044cc';
        ctx.fillRect(-car.width / 2, -car.height / 2, car.width, car.height);

        // Detalhe do cockpit / entradas de ar lateral
        ctx.fillStyle = '#111111';
        ctx.fillRect(-car.width / 2 + 3, -10, car.width - 6, 18);

        // Asas Dianteiras e Traseiras
        ctx.fillRect(-car.width / 2 - 5, -car.height / 2, car.width + 10, 6); // Asa dianteira
        ctx.fillRect(-car.width / 2 - 3, car.height / 2 - 6, car.width + 6, 8); // Asa traseira

        // Capacete do Piloto
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        ctx.arc(0, -4, 4.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    // HUD Clássico inspirado na televisão (Estilo TV Broadcast F1 2006)
    function drawHUD() {
        ctx.save();
        
        // Caixa de telemetria superior esquerda
        ctx.fillStyle = 'rgba(15, 15, 15, 0.85)';
        ctx.strokeStyle = '#e60000';
        ctx.lineWidth = 3;
        ctx.fillRect(25, 25, 240, 110);
        ctx.strokeRect(25, 25, 240, 110);

        // Siglas da Equipa / Jogo
        ctx.fillStyle = '#e60000';
        ctx.font = 'bold 14px Arial';
        ctx.fillText('F1 2006 | PS2 PORT', 42, 50);

        // Velocímetro digital
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        let kmh = Math.round(Math.abs(car.speed) * 18);
        ctx.fillText(`${kmh} `, 42, 85);
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#aaaaaa';
        ctx.fillText('KM/H', 105, 83);

        // Indicador de Marcha
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(`GEAR: ${car.gear}`, 42, 118);

        ctx.restore();
    }

    function gameLoop() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        update();
        drawTrack();
        drawCar();
        drawHUD();

        requestAnimationFrame(gameLoop);
    }

    gameLoop();
});
le',ArrowDown:'brake',s:'brake'};if(map[e.key])held[map[e.key]]=false});
function loop(now){
 requestAnimationFrame(loop);const dt=Math.min(.04,(now-last)/1000);last=now;
 if(!paused&&playerState.started&&!playerState.finished){
  raceTime+=dt;
  const accel=held.throttle?0.22:0,braking=held.brake?0.38:0;
  playerState.speed=THREE.MathUtils.clamp(playerState.speed+(accel-braking-.035)*dt,0,.62);
  const turn=(held.left?-1:0)+(held.right?1:0);
  playerState.steer=THREE.MathUtils.lerp(playerState.steer,turn,.12);
  playerState.lane+=playerState.steer*dt*(1.6+playerState.speed*3.4);
  playerState.lane*=Math.pow(.985,dt*60);
  const forward=playerState.speed/trackLength*95;
  const previousT=playerState.t;
  playerState.t=(playerState.t+forward*dt)%1;
  if(playerState.t<previousT && raceTime>4){playerState.lap++;if(playerState.lap>3){playerState.finished=true;paused=true;showOverlay('finish')}}
  const off=Math.abs(playerState.lane)>6.3;
  if(off&&!playerState.offtrack){playerState.condition=Math.max(0,playerState.condition-3);document.querySelector('#message').textContent='FORA DA PISTA!';}
  playerState.offtrack=off;
  if(!off)document.querySelector('#message').textContent='';
  playerState.lane=THREE.MathUtils.clamp(playerState.lane,-9,9);
  for(const r of rivals){
   const old=r.t;r.t=(r.t+r.speed*dt/trackLength*100)%1;
   if(r.t<old)r.lap++;
   const p=curve.getPointAt(r.t),tan=curve.getTangentAt(r.t),side=new THREE.Vector3(-tan.z,0,tan.x);
   r.mesh.position.copy(p).addScaledVector(side,r.lane);r.mesh.position.y=.02;r.mesh.rotation.y=Math.atan2(tan.x,tan.z);
  }
 }
 const info=placeOnTrack(player,playerState.t,playerState.lane,.02);
 const speedBlend=playerState.speed/.62;
 const camPos=player.position.clone().add(new THREE.Vector3(0,3.1+speedBlend*1.3,-7.4-speedBlend*1.3));
 camera.position.lerp(camPos,1-Math.pow(.001,dt));
 const look=player.position.clone().add(new THREE.Vector3(0,.6,3.4));camera.lookAt(look);
 camera.fov=THREE.MathUtils.lerp(camera.fov,62+speedBlend*5,.04);camera.updateProjectionMatrix();
 updateHUD();renderer.render(scene,camera);
}
placeOnTrack(player,0,0,.02);
for(const r of rivals){const p=curve.getPointAt(r.t);updateCar(r.mesh,r.t,r.lane,.02)}
requestAnimationFrame(loop);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.7));renderer.setSize(innerWidth,innerHeight)});
document.querySelector('#loading').style.opacity='0';setTimeout(()=>document.querySelector('#loading')?.remove(),500);
