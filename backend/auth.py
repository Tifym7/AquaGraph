import os
import datetime
from functools import wraps

import jwt
from flask import Blueprint, request, jsonify, g
from dotenv import load_dotenv

from user.persistence.user_db_repo import UserDBRepo
from user.model.user import User
from user.services.user_service import UserService

load_dotenv()

auth_bp = Blueprint('auth', __name__, url_prefix='/api')

SECRET_KEY = os.getenv('SECRET_KEY', '15b638680a0415d326ceb1dde89dace16b326b6d45af7ace5fa40fc8355ce816')
TOKEN_EXPIRY_HOURS = int(os.getenv('TOKEN_EXPIRY_HOURS', 24))

# Conectare la PostgreSQL
_repo = UserDBRepo(
    url=os.getenv('DB_URL', 'postgresql://localhost:5432/aquaGraph'),
    username=os.getenv('DB_USER', ''),
    password=os.getenv('DB_PASSWORD', ''),
)
_service = UserService(_repo)

def _generate_token(username: str, role: str = 'user') -> str:
    payload = {
        'sub': username,
        'role': role,
        'iat': datetime.datetime.utcnow(),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm='HS256')

def _decode_token(token: str) -> dict:
    return jwt.decode(token, SECRET_KEY, algorithms=['HS256'])

def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            return jsonify({'error': 'Token lipsă'}), 401
        token = auth_header.split(' ', 1)[1]
        try:
            payload = _decode_token(token)
            g.current_user = payload['sub']
            g.current_role = payload.get('role', 'user')
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expirat'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Token invalid'}), 401
        return f(*args, **kwargs)
    return decorated

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Corp JSON lipsă'}), 400
    try:
        user = User(
            username=data.get('username', '').strip(),
            password=data.get('password', ''),
            email=data.get('email', '').strip(),
            region=data.get('region', '').strip(),
        )
        saved = _repo.save(user)
        token = _generate_token(saved.get_username())
        return jsonify({
            'token': token,
            'user': {
                'username': saved.get_username(),
                'email': saved.get_email(),
                'region': saved.get_region(),
            }
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Corp JSON lipsă'}), 400
    username = data.get('username', '').strip()
    password = data.get('password', '')
    try:
        user = _service.authenticate_username(username, password)
        token = _generate_token(user.get_username())
        return jsonify({
            'token': token,
            'user': {
                'username': user.get_username(),
                'email': user.get_email(),
                'region': user.get_region(),
            }
        }), 200
    except Exception:
        return jsonify({'error': 'Username sau parolă incorectă'}), 401

@auth_bp.route('/me', methods=['GET'])
@auth_required
def me():
    user = _repo.get_user_by_username(g.current_user)
    if not user:
        return jsonify({'error': 'User negăsit'}), 404
    return jsonify({
        'username': user.get_username(),
        'email': user.get_email(),
        'region': user.get_region(),
    }), 200