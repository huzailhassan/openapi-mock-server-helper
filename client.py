import json
import uuid
import base64
import requests
import time
import hmac
import hashlib

from os import urandom
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


"""
|--------------------------------------------------------------------------
| CONFIG
|--------------------------------------------------------------------------
"""

API_KEY = 'ak_live_demo'

API_SECRET = 'test-secret-key'

PAYLOAD_KEY = base64.b64decode(
    'PGkJs5UPAqGq2jAdx36Y6wKJp9eQrTyU2vBnMqXz4Y8='
)

BASE_URL = 'http://localhost:4000'


"""
|--------------------------------------------------------------------------
| AES ENCRYPT
|--------------------------------------------------------------------------
"""

def encrypt_payload(payload_object):

    nonce = urandom(12)

    aesgcm = AESGCM(PAYLOAD_KEY)

    plaintext = json.dumps(
        payload_object,
        separators=(',', ':')
    ).encode('utf-8')

    encrypted = aesgcm.encrypt(
        nonce,
        plaintext,
        None
    )

    return {
        'nonce': base64.b64encode(
            nonce
        ).decode(),

        'payload': base64.b64encode(
            encrypted
        ).decode()
    }


"""
|--------------------------------------------------------------------------
| AES DECRYPT
|--------------------------------------------------------------------------
"""

def decrypt_payload(
    nonce_b64,
    payload_b64
):

    nonce = base64.b64decode(
        nonce_b64
    )

    encrypted = base64.b64decode(
        payload_b64
    )

    aesgcm = AESGCM(PAYLOAD_KEY)

    decrypted = aesgcm.decrypt(
        nonce,
        encrypted,
        None
    )

    return json.loads(
        decrypted.decode('utf-8')
    )


"""
|--------------------------------------------------------------------------
| MANUAL DECRYPT
|--------------------------------------------------------------------------
"""

def decrypt_text():

    print('\n==============================')
    print(' 手动解密 ')
    print('==============================')

    nonce = input(
        '请输入 nonce: '
    ).strip()

    payload = input(
        '请输入 payload: '
    ).strip()

    try:

        result = decrypt_payload(
            nonce,
            payload
        )

        print('\n==============================')
        print('解密结果')
        print('==============================')

        print(
            json.dumps(
                result,
                indent=2,
                ensure_ascii=False
            )
        )

    except Exception as e:

        print('\n解密失败:')
        print(str(e))


"""
|--------------------------------------------------------------------------
| SIGN
|--------------------------------------------------------------------------
"""

def sign_payload(raw_body):

    canonical = f'\n{raw_body}'

    signature = hmac.new(
        API_SECRET.encode(),
        canonical.encode(),
        hashlib.sha256
    ).hexdigest()

    return signature


"""
|--------------------------------------------------------------------------
| SEND REQUEST
|--------------------------------------------------------------------------
"""

def send_request(endpoint, payload):

    print('\n==============================')
    print('原始请求 Payload')
    print('==============================')

    print(
        json.dumps(
            payload,
            indent=2,
            ensure_ascii=False
        )
    )

    encrypted = encrypt_payload(payload)

    print('\n==============================')
    print('加密后请求体')
    print('==============================')

    print(
        json.dumps(
            encrypted,
            indent=2,
            ensure_ascii=False
        )
    )

    raw_body = json.dumps(
        encrypted,
        separators=(',', ':')
    )

    signature = sign_payload(
        raw_body
    )

    print('\n==============================')
    print('请求签名')
    print('==============================')

    print(signature)

    print('\n==============================')
    print('最终发送 RAW BODY')
    print('==============================')

    print(raw_body)

    headers = {
        'x-api-key': API_KEY,
        'x-signature': signature,
        'content-type': 'application/json'
    }

    print('\n==============================')
    print('请求 Headers')
    print('==============================')

    print(
        json.dumps(
            headers,
            indent=2,
            ensure_ascii=False
        )
    )

    print('\n==============================')
    print('完整请求 URL')
    print('==============================')

    print(f'{BASE_URL}{endpoint}')

    print('\n==============================')
    print(f'POST {endpoint}')
    print('==============================')

    response = requests.post(
        f'{BASE_URL}{endpoint}',
        data=raw_body,
        headers=headers
    )

    print('\nHTTP STATUS:')
    print(response.status_code)

    try:

        response_data = response.json()

        print('\n==============================')
        print('服务端原始响应')
        print('==============================')

        print(
            json.dumps(
                response_data,
                indent=2,
                ensure_ascii=False
            )
        )

        decrypted_response = decrypt_payload(
            response_data['nonce'],
            response_data['payload']
        )

        print('\n==============================')
        print('解密后的响应')
        print('==============================')

        print(
            json.dumps(
                decrypted_response,
                indent=2,
                ensure_ascii=False
            )
        )

    except Exception as e:

        print('\n响应解析失败:')
        print(str(e))

        print('\n原始响应:')
        print(response.text)


"""
|--------------------------------------------------------------------------
| COMMON PAYLOAD
|--------------------------------------------------------------------------
"""

def build_common_payload():

    return {
        'requestId': str(uuid.uuid4()),
        'requestAt': int(time.time() * 1000),
        'userName': input('请输入 userName: ').strip(),
        'currency': input('请输入 currency (默认 USD): ').strip() or 'USD'
    }


"""
|--------------------------------------------------------------------------
| LOGIN
|--------------------------------------------------------------------------
"""

def login_request():

    payload = build_common_payload()

    payload['gameId'] = input(
        '请输入 gameId: '
    ).strip()

    payload['language'] = input(
        '请输入 language (默认 en): '
    ).strip() or 'en'

    send_request(
        '/dev/api/v1/user/login',
        payload
    )


"""
|--------------------------------------------------------------------------
| BALANCE
|--------------------------------------------------------------------------
"""

def balance_request():

    payload = build_common_payload()

    send_request(
        '/dev/api/v1/wallet/balance',
        payload
    )


"""
|--------------------------------------------------------------------------
| BET
|--------------------------------------------------------------------------
"""

def bet_request():

    payload = build_common_payload()

    payload['transactionId'] = str(
        uuid.uuid4()
    )

    payload['betAmount'] = float(
        input('请输入 betAmount: ')
    )

    send_request(
        '/dev/api/v1/wallet/bet',
        payload
    )


"""
|--------------------------------------------------------------------------
| PAYOUT
|--------------------------------------------------------------------------
"""

def payout_request():

    payload = build_common_payload()

    payload['transactionId'] = str(
        uuid.uuid4()
    )

    payload['payAmount'] = float(
        input('请输入 payAmount: ')
    )

    send_request(
        '/dev/api/v1/wallet/payout',
        payload
    )


"""
|--------------------------------------------------------------------------
| ROLLBACK
|--------------------------------------------------------------------------
"""

def rollback_request():

    payload = build_common_payload()

    payload['transactionId'] = str(
        uuid.uuid4()
    )

    payload['oriTransactionId'] = input(
        '请输入原 transactionId: '
    ).strip()

    send_request(
        '/dev/api/v1/wallet/rollback',
        payload
    )


"""
|--------------------------------------------------------------------------
| CUSTOM
|--------------------------------------------------------------------------
"""

def custom_request():

    endpoint = input(
        '请输入 API Endpoint: '
    ).strip()

    raw_json = input(
        '请输入 JSON Payload: '
    ).strip()

    try:

        payload = json.loads(
            raw_json
        )

    except Exception:

        print('JSON 格式错误')
        return

    send_request(
        endpoint,
        payload
    )


"""
|--------------------------------------------------------------------------
| MENU
|--------------------------------------------------------------------------
"""

def menu():

    while True:

        print('\n==============================')
        print(' API TEST MENU ')
        print('==============================')
        print('1. Login')
        print('2. Balance')
        print('3. Bet')
        print('4. Payout')
        print('5. Rollback')
        print('6. Custom Request')
        print('7. Decrypt Text')
        print('0. Exit')
        print('==============================')

        choice = input(
            '请选择功能: '
        ).strip()

        if choice == '1':

            login_request()

        elif choice == '2':

            balance_request()

        elif choice == '3':

            bet_request()

        elif choice == '4':

            payout_request()

        elif choice == '5':

            rollback_request()

        elif choice == '6':

            custom_request()

        elif choice == '7':

            decrypt_text()

        elif choice == '0':

            print('已退出')
            break

        else:

            print('无效选项，请重新输入')


"""
|--------------------------------------------------------------------------
| START
|--------------------------------------------------------------------------
"""

if __name__ == '__main__':

    menu()