import * as THREE from 'three';

const socket = io();
let myUsername = localStorage.getItem('osfight_isim');
if (!myUsername) {
    window.location.href = 'index.html';
}

// Global değişkenler
let scene, camera, renderer;
let players = {}; // username -> { mesh, nameLabel, hpBar, energyLabel }
let boxes = {}; // boxId -> { mesh, hpLabel }
let myPlayerMesh;
let selectedFriend = null;
const keys = {};

// Sabitler
const MOVE_SPEED = 8; // birim/saniye
const ATTACK_RANGE = 3;
const COLLECT_RANGE = 2;

// HTML elementleri
const mesajlarDiv = document.getElementById('mesajlar');
const arkadasUl = document.getElementById('arkadasUl');

// Giriş yap
socket.emit('login', myUsername);

// Socket olayları
socket.on('login_success', (data) => {
    document.getElementById('oyuncuAdi').textContent = `⚔️ ${data.username}`;
    guncelleArkadasListesi(data.friends);
    guncelleOyuncular(data.players);
    guncelleKutular(data.boxes);
    baslat3D();
});

socket.on('update_online_users', (onlineUsers) => {
    document.getElementById('onlineSayisi').textContent = `Online: ${onlineUsers.length}`;
});

socket.on('update_players', (playersData) => {
    guncelleOyuncular(playersData);
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

// Arkadaş listesini güncelle
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
    // Mevcut oyuncu mesh'lerini güncelle veya oluştur
    Object.keys(playersData).forEach(username => {
        const data = playersData[username];
        if (!players[username]) {
            // Yeni oyuncu
            if (scene) {
                const geometry = new THREE.BoxGeometry(1, 1.5, 1);
                const material = new THREE.MeshStandardMaterial({ color: 0x3498db });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(data.position.x, data.position.y, data.position.z);
                scene.add(mesh);
                players[username] = {
                    mesh,
                    hp: data.hp,
                    power: data.power
                };
                // İsim etiketi (HTML overlay)
                const nameDiv = document.createElement('div');
                nameDiv.className = 'oyuncuEtiket';
                nameDiv.innerHTML = `<div class="isim">${username}</div>
                                     <div class="canBar"><div class="canDoluluk" style="width:${data.hp}%"></div></div>
                                     <div class="enerji">⚡${data.power}</div>`;
                document.body.appendChild(nameDiv);
                players[username].nameLabel = nameDiv;
            }
        } else {
            // Mevcut oyuncuyu güncelle
            const p = players[username];
            p.mesh.position.set(data.position.x, data.position.y, data.position.z);
            p.hp = data.hp;
            p.power = data.power;
            p.nameLabel.querySelector('.canDoluluk').style.width = `${data.hp}%`;
            p.nameLabel.querySelector('.enerji').textContent = `⚡${data.power}`;
        }
    });

    // Oyundan ayrılan oyuncuları kaldır
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
        if (!boxes[boxData.id]) {
            if (scene) {
                const geometry = new THREE.BoxGeometry(1, 1, 1);
                const material = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(boxData.position.x, boxData.position.y, boxData.position.z);
                scene.add(mesh);
                boxes[boxData.id] = { mesh, hpLabel: null };
                // Can etiketi
                const hpDiv = document.createElement('div');
                hpDiv.className = 'kutuCan';
                hpDiv.textContent = `HP: ${boxData.hp}/${boxData.maxHp}`;
                document.body.appendChild(hpDiv);
                boxes[boxData.id].hpLabel = hpDiv;
            }
        } else {
            const box = boxes[boxData.id];
            box.mesh.position.set(boxData.position.x, boxData.position.y, boxData.position.z);
            if (boxData.hp <= 0) {
                box.mesh.material.color.set(0x555555);
            } else {
                box.mesh.material.color.set(0x8B4513);
            }
            box.hpLabel.textContent = `HP: ${boxData.hp}/${boxData.maxHp}`;
            // Enerji objesi gösterimi (basitçe parlak küre)
            if (boxData.energyAvailable) {
                if (!box.energyMesh) {
                    const energyGeo = new THREE.SphereGeometry(0.3, 16, 16);
                    const energyMat = new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xffff00 });
                    box.energyMesh = new THREE.Mesh(energyGeo, energyMat);
                    box.energyMesh.position.set(boxData.position.x, boxData.position.y + 1, boxData.position.z);
                    scene.add(box.energyMesh);
                }
            } else {
                if (box.energyMesh) {
                    scene.remove(box.energyMesh);
                    box.energyMesh = null;
                }
            }
        }
    });
}

// 3D sahneyi başlat
function baslat3D() {
    const container = document.getElementById('canvasContainer');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB); // gökyüzü

    camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(0, 10, 15);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Işıklar
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
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
        engel.position.set(
            (Math.random() - 0.5) * 40,
            0.5,
            (Math.random() - 0.5) * 40
        );
        scene.add(engel);
    }

    // Benim karakterim
    const myGeo = new THREE.BoxGeometry(1, 1.5, 1);
    const myMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f });
    myPlayerMesh = new THREE.Mesh(myGeo, myMat);
    myPlayerMesh.position.set(0, 0.25, 0);
    scene.add(myPlayerMesh);

    // Klavye dinleyicileri
    window.addEventListener('keydown', (e) => {
        keys[e.key.toLowerCase()] = true;
        if (e.key === ' ') saldir();
    });
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

    // Mobil butonlar
    document.querySelectorAll('.yon').forEach(btn => {
        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[btn.dataset.yon] = true;
        });
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[btn.dataset.yon] = false;
        });
        btn.addEventListener('mousedown', () => keys[btn.dataset.yon] = true);
        btn.addEventListener('mouseup', () => keys[btn.dataset.yon] = false);
    });
    document.getElementById('saldiriButonu').addEventListener('click', saldir);

    // Oyun döngüsü
    let lastTime = performance.now();

    function animate(currentTime) {
        requestAnimationFrame(animate);

        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;

        // Hareket
        if (myPlayerMesh) {
            let moveX = 0, moveZ = 0;
            if (keys['w'] || keys['arrowup']) moveZ -= 1;
            if (keys['s'] || keys['arrowdown']) moveZ += 1;
            if (keys['a'] || keys['arrowleft']) moveX -= 1;
            if (keys['d'] || keys['arrowright']) moveX += 1;

            if (moveX !== 0 || moveZ !== 0) {
                const norm = Math.sqrt(moveX * moveX + moveZ * moveZ);
                moveX /= norm;
                moveZ /= norm;
                myPlayerMesh.position.x += moveX * MOVE_SPEED * deltaTime;
                myPlayerMesh.position.z += moveZ * MOVE_SPEED * deltaTime;

                // Sunucuya pozisyon gönder
                socket.emit('update_position', {
                    x: myPlayerMesh.position.x,
                    y: myPlayerMesh.position.y,
                    z: myPlayerMesh.position.z
                });
            }
        }

        // Kamera takibi
        if (myPlayerMesh) {
            camera.position.x = myPlayerMesh.position.x;
            camera.position.z = myPlayerMesh.position.z + 15;
            camera.lookAt(myPlayerMesh.position);
        }

        // Oyuncu etiketlerini ekrana konumlandır
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

// Saldırı fonksiyonu
function saldir() {
    if (!myPlayerMesh) return;
    // En yakın kutuya hasar ver
    Object.keys(boxes).forEach(boxId => {
        const boxData = boxes[boxId].mesh;
        const dx = myPlayerMesh.position.x - boxData.position.x;
        const dz = myPlayerMesh.position.z - boxData.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= ATTACK_RANGE) {
            socket.emit('damage_box', boxId);
        }
    });
}

// Enerji toplama (otomatik)
function checkEnergyCollection() {
    if (!myPlayerMesh) return;
    Object.keys(boxes).forEach(boxId => {
        const box = boxes[boxId];
        if (box.energyMesh) {
            const dx = myPlayerMesh.position.x - box.energyMesh.position.x;
            const dz = myPlayerMesh.position.z - box.energyMesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist <= COLLECT_RANGE) {
                socket.emit('collect_energy', boxId);
            }
        }
    });
}

// Her karede enerji kontrolü yap
setInterval(checkEnergyCollection, 500); // yarım saniyede bir kontrol

// Mesaj gönderme
window.mesajGonder = function() {
    const input = document.getElementById('mesajInput');
    const message = input.value.trim();
    if (!message || !selectedFriend) return alert('Önce bir arkadaş seç!');
    socket.emit('send_message', { to: selectedFriend, message });
    input.value = '';
};

// Arkadaş sayfasına git
window.arkadasSayfasi = function() {
    window.location.href = 'arkadas.html';
};

// Başla butonu (şimdilik sadece bilgi)
window.basla = function() {
    alert('OsFight başladı! W-A-S-D veya mobil butonlarla hareket et.');
};

// Sayfa yüklendiğinde güç göstergesini güncellemek için
socket.on('update_players', (playersData) => {
    if (playersData[myUsername]) {
        document.getElementById('gucGosterge').textContent = `⚡ Güç: ${playersData[myUsername].power}`;
    }
});
