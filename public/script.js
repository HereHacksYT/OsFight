import * as THREE from 'three';

const socket = io();
let myUsername = localStorage.getItem('osfight_isim');
if (!myUsername) {
    window.location.href = 'index.html';
}

// Global değişkenler
let scene, camera, renderer;
let lobiScene, lobiCamera, lobiRenderer, lobiCharacterMesh;
let players = {};
let boxes = {};
let myPlayerMesh;
let selectedFriend = null;
let gameStarted = false;
let selectedCharacter = 'kup'; // varsayılan küp adam
let lobiAnimationId;

// Joystick değişkenleri
const joystickAlani = document.getElementById('joystickAlani');
const joystickKol = document.getElementById('joystickKol');
let joystickAktif = false;
let joystickMerkezX = 0;
let joystickMerkezY = 0;
let joystickDX = 0;
let joystickDY = 0;

const keys = {};
const MOVE_SPEED = 8;
const ATTACK_RANGE = 3;
const COLLECT_RANGE = 2;

const mesajlarDiv = document.getElementById('mesajlar');
const arkadasUl = document.getElementById('arkadasUl');

// Giriş yap
window.girisYap = function() {
    const username = document.getElementById('isimInput').value.trim();
    if (!username) {
        alert('İsim girmelisin!');
        return;
    }
    localStorage.setItem('osfight_isim', username);
    myUsername = username;
    socket.emit('login', username);
};

// Arkadaş sayfasına git
window.arkadasSayfasi = function() {
    window.location.href = 'arkadas.html';
};

// Karakter seç
window.karakterSec = function(tip) {
    selectedCharacter = tip;
    // Görsel seçimi güncelle
    document.getElementById('kupAdamKart').classList.remove('secili');
    document.getElementById('topAdamKart').classList.remove('secili');
    if (tip === 'kup') {
        document.getElementById('kupAdamKart').classList.add('secili');
    } else {
        document.getElementById('topAdamKart').classList.add('secili');
    }
    // Lobi önizlemesini güncelle
    if (lobiScene && lobiCharacterMesh) {
        lobiScene.remove(lobiCharacterMesh);
        lobiCharacterMesh = createLobiCharacterMesh(tip);
        lobiScene.add(lobiCharacterMesh);
    }
};

// Lobi karakter mesh'i oluştur
function createLobiCharacterMesh(tip) {
    if (tip === 'kup') {
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
        return new THREE.Mesh(geo, mat);
    } else {
        const geo = new THREE.SphereGeometry(0.6, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ color: 0xe67e22 });
        return new THREE.Mesh(geo, mat);
    }
}

// Oyunu başlat
window.oyunuBaslat = function() {
    if (gameStarted) return;
    gameStarted = true;
    // Lobi ekranını kapat
    document.getElementById('lobiEkrani').style.display = 'none';
    document.getElementById('oyunEkrani').style.display = 'block';
    // Lobi animasyonunu durdur
    if (lobiAnimationId) cancelAnimationFrame(lobiAnimationId);
    if (lobiRenderer) {
        lobiRenderer.dispose();
        lobiRenderer = null;
    }
    // Oyun sahnesini başlat
    baslat3D();
};

// Giriş başarılı
socket.on('login_success', (data) => {
    document.getElementById('girisEkrani').style.display = 'none';
    document.getElementById('lobiEkrani').style.display = 'block';
    document.getElementById('oyuncuAdi').textContent = `⚔️ ${data.username}`;
    // Lobi sahnesini başlat
    baslatLobi();
    guncelleArkadasListesi(data.friends);
    guncelleOyuncular(data.players);
    guncelleKutular(data.boxes);
});

socket.on('update_online_users', (onlineUsers) => {
    document.getElementById('onlineSayisi').textContent = `Online: ${onlineUsers.length}`;
});

socket.on('update_players', (playersData) => {
    guncelleOyuncular(playersData);
    if (playersData[myUsername]) {
        document.getElementById('gucGosterge').textContent = `⚡ Güç: ${playersData[myUsername].power}`;
    }
});

socket.on('update_boxes', (boxesData) => {
    guncelleKutular(boxesData);
});

socket.on('receive_message', (msg) => {
    const div = document.createElement('div');
    div.innerHTML = `<strong>${msg.from}:</strong> ${msg.message}`;
    mesajlarDiv.appendChild(div);
    mesajlarDiv.scrollTop = mesajlarDiv.scrollHeight;
});

// Arkadaş listesi güncelle
function guncelleArkadasListesi(friends) {
    arkadasUl.innerHTML = '';
    friends.forEach(friend => {
        const li = document.createElement('li');
        li.textContent = friend;
        li.onclick = () => {
            selectedFriend = friend;
            document.getElementById('mesajInput').placeholder = `${friend} yaz...`;
        };
        arkadasUl.appendChild(li);
    });
}

// Oyuncuları güncelle
function guncelleOyuncular(playersData) {
    Object.keys(playersData).forEach(username => {
        const data = playersData[username];
        if (!players[username] && scene) {
            // Yeni oyuncu ekle
            const geometry = new THREE.BoxGeometry(1, 1.5, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x3498db });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(data.position.x, data.position.y, data.position.z);
            scene.add(mesh);
            players[username] = {
                mesh: mesh,
                hp: data.hp,
                power: data.power
            };
            // İsim etiketi oluştur
            const nameDiv = document.createElement('div');
            nameDiv.className = 'oyuncuEtiket';
            nameDiv.innerHTML = `<div class="isim">${username}</div>
                                 <div class="canBar"><div class="canDoluluk" style="width:${data.hp}%"></div></div>
                                 <div class="enerji">⚡${data.power}</div>`;
            document.body.appendChild(nameDiv);
            players[username].nameLabel = nameDiv;
        } else if (players[username]) {
            // Mevcut oyuncuyu güncelle
            const p = players[username];
            p.mesh.position.set(data.position.x, data.position.y, data.position.z);
            p.hp = data.hp;
            p.power = data.power;
            p.nameLabel.querySelector('.canDoluluk').style.width = `${data.hp}%`;
            p.nameLabel.querySelector('.enerji').textContent = `⚡${data.power}`;
        }
    });

    // Oyundan ayrılanları kaldır
    Object.keys(players).forEach(username => {
        if (!playersData[username]) {
            scene.remove(players[username].mesh);
            document.body.removeChild(players[username].nameLabel);
            delete players[username];
        }
    });
}

// Kutuları güncelle
function guncelleKutular(boxesData) {
    boxesData.forEach(boxData => {
        if (!boxes[boxData.id] && scene) {
            // Yeni kutu oluştur
            const geometry = new THREE.BoxGeometry(1, 1, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(boxData.position.x, boxData.position.y, boxData.position.z);
            scene.add(mesh);
            boxes[boxData.id] = { mesh: mesh, hpLabel: null };
            // Can etiketi
            const hpDiv = document.createElement('div');
            hpDiv.className = 'kutuCan';
            hpDiv.textContent = `HP: ${boxData.hp}/${boxData.maxHp}`;
            document.body.appendChild(hpDiv);
            boxes[boxData.id].hpLabel = hpDiv;
        } else if (boxes[boxData.id]) {
            // Mevcut kutuyu güncelle
            const box = boxes[boxData.id];
            box.mesh.position.set(boxData.position.x, boxData.position.y, boxData.position.z);
            if (boxData.hp <= 0) {
                box.mesh.material.color.set(0x555555);
            } else {
                box.mesh.material.color.set(0x8B4513);
            }
            box.hpLabel.textContent = `HP: ${boxData.hp}/${boxData.maxHp}`;

            // Enerji objesi
            if (boxData.energyAvailable) {
                if (!box.energyMesh) {
                    const energyGeo = new THREE.SphereGeometry(0.3, 16, 16);
                    const energyMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00 });
                    box.energyMesh = new THREE.Mesh(energyGeo, energyMat);
                    box.energyMesh.position.set(boxData.position.x, boxData.position.y + 1, boxData.position.z);
                    scene.add(box.energyMesh);
                }
            } else if (box.energyMesh) {
                scene.remove(box.energyMesh);
                box.energyMesh = null;
            }
        }
    });
}

// Lobi sahnesini başlat
function baslatLobi() {
    const container = document.getElementById('lobiCanvasContainer');
    lobiScene = new THREE.Scene();
    lobiScene.background = new THREE.Color(0x1a1a2e);
    lobiCamera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    lobiCamera.position.set(0, 2, 5);
    lobiCamera.lookAt(0, 0.5, 0);

    lobiRenderer = new THREE.WebGLRenderer({ antialias: true });
    lobiRenderer.setSize(container.clientWidth, container.clientHeight);
    lobiRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(lobiRenderer.domElement);

    // Işıklar
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    lobiScene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 5);
    lobiScene.add(dirLight);

    // Mavi küp (platform)
    const platformGeo = new THREE.BoxGeometry(3, 0.2, 3);
    const platformMat = new THREE.MeshStandardMaterial({ color: 0x3498db });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = -0.5;
    lobiScene.add(platform);

    // Karakter önizleme mesh'i
    lobiCharacterMesh = createLobiCharacterMesh(selectedCharacter);
    lobiCharacterMesh.position.y = 0.2;
    lobiScene.add(lobiCharacterMesh);

    // Varsayılan seçimi işaretle
    document.getElementById('kupAdamKart').classList.add('secili');

    // Animasyon döngüsü
    function lobiAnimate() {
        lobiAnimationId = requestAnimationFrame(lobiAnimate);
        if (lobiCharacterMesh) {
            lobiCharacterMesh.rotation.y += 0.01;
        }
        lobiRenderer.render(lobiScene, lobiCamera);
    }
    lobiAnimate();

    window.addEventListener('resize', () => {
        if (lobiCamera) {
            lobiCamera.aspect = container.clientWidth / container.clientHeight;
            lobiCamera.updateProjectionMatrix();
            lobiRenderer.setSize(container.clientWidth, container.clientHeight);
        }
    });
}

// Oyun 3D sahnesi
function baslat3D() {
    const container = document.getElementById('canvasContainer');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 10, 15);
    camera.lookAt(0, 0, 0);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Işıklar
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 5);
    scene.add(dirLight);

    // Yeşil zemin
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x228B22, side: THREE.DoubleSide });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = Math.PI / 2;
    ground.position.y = -0.5;
    scene.add(ground);

    // Sarı engel küpleri
    const engelMat = new THREE.MeshStandardMaterial({ color: 0xFFD700 });
    for (let i = 0; i < 20; i++) {
        const engelGeo = new THREE.BoxGeometry(1, 2, 1);
        const engel = new THREE.Mesh(engelGeo, engelMat);
        engel.position.set((Math.random() - 0.5) * 40, 0.5, (Math.random() - 0.5) * 40);
        scene.add(engel);
    }

    // Oyuncu karakterini seçilen tipe göre oluştur
    if (selectedCharacter === 'kup') {
        const geo = new THREE.BoxGeometry(1, 1.5, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
        myPlayerMesh = new THREE.Mesh(geo, mat);
    } else {
        const geo = new THREE.SphereGeometry(0.8, 32, 32);
        const mat = new THREE.MeshStandardMaterial({ color: 0xe67e22 });
        myPlayerMesh = new THREE.Mesh(geo, mat);
    }
    myPlayerMesh.position.set(0, 0.25, 0);
    scene.add(myPlayerMesh);

    // Klavye olayları
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === ' ') saldir();
    });
    window.addEventListener('keyup', (e) => {
        keys[e.key.toLowerCase()] = false;
    });

    // Joystick olayları
    joystickAlani.addEventListener('touchstart', joystickBasla, { passive: false });
    joystickAlani.addEventListener('touchmove', joystickHareket, { passive: false });
    joystickAlani.addEventListener('touchend', joystickBitir);
    joystickAlani.addEventListener('mousedown', joystickBasla);
    window.addEventListener('mousemove', joystickHareket);
    window.addEventListener('mouseup', joystickBitir);

    // Saldırı butonu
    document.getElementById('saldiriButonu').addEventListener('click', saldir);
    document.getElementById('saldiriButonu').addEventListener('touchstart', (e) => {
        e.preventDefault();
        saldir();
    });

    // Çift tıklamayı engelle
    document.addEventListener('dblclick', (e) => e.preventDefault());

    // Oyun döngüsü
    let lastTime = performance.now();
    function animate(currentTime) {
        requestAnimationFrame(animate);
        const delta = Math.min((currentTime - lastTime) / 1000, 0.1);
        lastTime = currentTime;

        if (myPlayerMesh && gameStarted) {
            let moveX = 0;
            let moveZ = 0;
            if (keys['w'] || keys['arrowup']) moveZ -= 1;
            if (keys['s'] || keys['arrowdown']) moveZ += 1;
            if (keys['a'] || keys['arrowleft']) moveX -= 1;
            if (keys['d'] || keys['arrowright']) moveX += 1;
            if (joystickAktif) {
                moveX += joystickDX;
                moveZ += joystickDY;
            }
            if (moveX !== 0 || moveZ !== 0) {
                const norm = Math.sqrt(moveX * moveX + moveZ * moveZ);
                if (norm > 1) {
                    moveX /= norm;
                    moveZ /= norm;
                }
                myPlayerMesh.position.x += moveX * MOVE_SPEED * delta;
                myPlayerMesh.position.z += moveZ * MOVE_SPEED * delta;
                socket.emit('update_position', {
                    x: myPlayerMesh.position.x,
                    y: myPlayerMesh.position.y,
                    z: myPlayerMesh.position.z
                });
            }
        }

        if (myPlayerMesh) {
            camera.position.x = myPlayerMesh.position.x;
            camera.position.z = myPlayerMesh.position.z + 15;
            camera.lookAt(myPlayerMesh.position);
        }

        // Oyuncu etiketlerini konumlandır
        Object.keys(players).forEach(username => {
            const p = players[username];
            const screenPos = p.mesh.position.clone().project(camera);
            const x = (screenPos.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
            p.nameLabel.style.left = `${x}px`;
            p.nameLabel.style.top = `${y - 50}px`;
        });

        // Kutu can etiketlerini konumlandır
        Object.keys(boxes).forEach(boxId => {
            const box = boxes[boxId];
            const screenPos = box.mesh.position.clone().project(camera);
            const x = (screenPos.x * 0.5 + 0.5) * renderer.domElement.clientWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * renderer.domElement.clientHeight;
            box.hpLabel.style.left = `${x}px`;
            box.hpLabel.style.top = `${y - 30}px`;
        });

        renderer.render(scene, camera);
    }
    requestAnimationFrame(animate);

    window.addEventListener('resize', () => {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
}

// Joystick fonksiyonları
function joystickBasla(e) {
    e.preventDefault();
    joystickAktif = true;
    const rect = joystickAlani.getBoundingClientRect();
    joystickMerkezX = rect.left + rect.width / 2;
    joystickMerkezY = rect.top + rect.height / 2;
}

function joystickHareket(e) {
    if (!joystickAktif) return;
    e.preventDefault();
    let clientX, clientY;
    if (e.touches) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
    } else {
        clientX = e.clientX;
        clientY = e.clientY;
    }
    const dx = clientX - joystickMerkezX;
    const dy = clientY - joystickMerkezY;
    const maxDist = 40;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, maxDist);
    const angle = Math.atan2(dy, dx);
    const clampedDx = Math.cos(angle) * clampedDist;
    const clampedDy = Math.sin(angle) * clampedDist;
    joystickKol.style.transform = `translate(${clampedDx}px, ${clampedDy}px)`;
    joystickDX = clampedDx / maxDist;
    joystickDY = clampedDy / maxDist;
}

function joystickBitir() {
    joystickAktif = false;
    joystickKol.style.transform = 'translate(0,0)';
    joystickDX = 0;
    joystickDY = 0;
}

// Saldırı fonksiyonu
function saldir() {
    if (!myPlayerMesh) return;
    Object.keys(boxes).forEach(boxId => {
        const box = boxes[boxId];
        const dx = myPlayerMesh.position.x - box.mesh.position.x;
        const dz = myPlayerMesh.position.z - box.mesh.position.z;
        if (Math.sqrt(dx * dx + dz * dz) <= ATTACK_RANGE) {
            socket.emit('damage_box', boxId);
        }
    });
}

// Enerji toplama kontrolü
setInterval(() => {
    if (!myPlayerMesh) return;
    Object.keys(boxes).forEach(boxId => {
        const box = boxes[boxId];
        if (box.energyMesh) {
            const dx = myPlayerMesh.position.x - box.energyMesh.position.x;
            const dz = myPlayerMesh.position.z - box.energyMesh.position.z;
            if (Math.sqrt(dx * dx + dz * dz) <= COLLECT_RANGE) {
                socket.emit('collect_energy', boxId);
            }
        }
    });
}, 500);

// Yatay mod kontrolü
function checkOrientation() {
    if (window.innerHeight > window.innerWidth) {
        document.getElementById('dikeyUyari').style.display = 'flex';
    } else {
        document.getElementById('dikeyUyari').style.display = 'none';
    }
}
window.addEventListener('orientationchange', checkOrientation);
window.addEventListener('resize', checkOrientation);
checkOrientation();
