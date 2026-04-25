import os
import json
import datetime
from functools import wraps

import jwt
from flask import Blueprint, request, jsonify, g
from werkzeug.security import generate_password_hash, check_password_hash
from dotenv import load_dotenv

load_dotenv()

auth_bp = Blueprint('auth', __name__, url_prefix='/api')

# ---------------------------------------------------------------------------
# Configurare
# ---------------------------------------------------------------------------
SECRET_KEY = os.getenv('SECRET_KEY', '15b638680a0415d326ceb1dde89dace16b326b6d45af7ace5fa40fc8355ce816')
TOKEN_EXPIRY_HOURS = int(os.getenv('TOKEN_EXPIRY_HOURS', 24))

# ---------------------------------------------------------------------------
# "Baza de date" de utilizatori
# Înlocuiește cu SQLAlchemy / PostgreSQL în producție.
# Parolele sunt stocate hash-uite, NICIODATĂ în plain text.
# ---------------------------------------------------------------------------
USERS_FILE = os.path.join(os.path.dirname(__file__), 'users.json')

def _load_users():
    if os.path.exists(USERS_FILE):
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    # Utilizator implicit pentru development — șterge în producție!
    return {
        "admin": {
            "password_hash": generate_password_hash("parola123"),
            "role": "admin",
            "name": "Administrator"
        }
    }

def _save_users(users):
    with open(USERS_FILE, 'w') as f:
        json.dump(users, f, indent=2)

# ---------------------------------------------------------------------------
# Generare și validare token JWT
# ---------------------------------------------------------------------------
def _generate_token(username: str, role: str) -> str:
    payload = {
        'sub': username,
        'role': role,
        'iat': datetime.datetime.utcnow(),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def _decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])

# ---------------------------------------------------------------------------
# Decorator pentru rute protejate
# Utilizare: @auth_required pe orice endpoint Flask care necesită autentificare
# ---------------------------------------------------------------------------
def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Token lipsă sau format invalid'}), 401
        token = auth_header.split(' ', 1)[1]
        try:
            payload = _decode_token(token)
            g.current_user = payload['sub']
            g.current_role = payload.get('role', 'user')
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirat, autentifică-te din nou'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token invalid'}), 401
        return f(*args, **kwargs)
    return decorated

# ---------------------------------------------------------------------------
# POST /api/login
# Body JSON: { "username": "...", "password": "..." }
# Răspuns:   { "token": "...", "user": { "username", "role", "name" } }
# ---------------------------------------------------------------------------
@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Corp JSON lipsă'}), 400

    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'error': 'Username și parolă sunt obligatorii'}), 400

    users = _load_users()
    user = users.get(username)

    if not user or not check_password_hash(user['password_hash'], password):
        return jsonify({'error': 'Username sau parolă incorectă'}), 401

    token = _generate_token(username, user.get('role', 'user'))

    return jsonify({
        'token': token,
        'user': {
            'username': username,
            'role': user.get('role', 'user'),
            'name': user.get('name', username),
            'email': user.get('email', ''),
            'region': user.get('region', ''),
        }
    }), 200

# ---------------------------------------------------------------------------
# POST /api/logout
# Stateless JWT — clientul șterge token-ul local.
# Endpoint opțional, util pentru logging server-side.
# ---------------------------------------------------------------------------
@auth_bp.route('/logout', methods=['POST'])
@auth_required
def logout():
    return jsonify({'message': f'Utilizatorul {g.current_user} s-a deconectat'}), 200

# ---------------------------------------------------------------------------
# GET /api/me — returnează datele utilizatorului curent
# Header necesar: Authorization: Bearer <token>
# ---------------------------------------------------------------------------
@auth_bp.route('/me', methods=['GET'])
@auth_required
def me():
    users = _load_users()
    user = users.get(g.current_user, {})
    return jsonify({
        'username': g.current_user,
        'role': g.current_role,
        'name': user.get('name', g.current_user),
    }), 200

# ---------------------------------------------------------------------------
# POST /api/register (opțional — dezactivează în producție dacă nu e necesar)
# Body JSON: { "username": "...", "password": "...", "name": "..." }
# ---------------------------------------------------------------------------
@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Corp JSON lipsă'}), 400

    username = data.get('username', '').strip()
    password = data.get('password', '')
    email    = data.get('email', '').strip()
    region   = data.get('region', '').strip()
    name     = data.get('name', username).strip()

    if not username or not password:
        return jsonify({'error': 'Username și parolă sunt obligatorii'}), 400
    if len(password) < 8:
        return jsonify({'error': 'Parola trebuie să aibă cel puțin 8 caractere'}), 400

    users = _load_users()
    if username in users:
        return jsonify({'error': 'Username deja folosit'}), 409

    users[username] = {
        'password_hash': generate_password_hash(password),
        'role': 'user',
        'name': name,
        'email': email,
        'region': region,
    }
    _save_users(users)

    token = _generate_token(username, 'user')
    return jsonify({
        'token': token,
        'user': {'username': username, 'role': 'user', 'name': name, 'email': email, 'region': region}
    }), 201