#!/bin/bash
# Exit on first error
set -e
# Grab the current directory
DIR="$( cd "$( dirname "${BASH_SOURCE\[0\]}" )" && pwd )"
echo
# check that the composer command exists at a version >v0.14
if hash composer 2>/dev/null; then
    composer --version | awk -F. '{if ($2<15) exit 1}'
    if \[ $? -eq 1 \]; then
        echo 'Sorry, Use createConnectionProfile for versions before v0.15.0' 
        exit 1
    else
        echo Using composer-cli at $(composer --version)
    fi
else
    echo 'Need to have composer-cli installed at v0.15 or greater'
    exit 1
fi
# need to get the certificate 
cat << EOF > /tmp/.connection.json
{
    "name": "hlfv11",
    "type": "hlfv11",
    "orderers": \[
       { "url" : "grpc://localhost:7050" }
    \],
    "ca": { 
        "url": "http://localhost:7054", 
        "name": "ca.org1.example.com"
    },
    "peers": \[
        {
            "requestURL": "grpc://localhost:7051",
            "eventURL": "grpc://localhost:7053"
        }, {
            "requestURL": "grpc://localhost:8051",
            "eventURL": "grpc://localhost:8053"
        }, {
            "requestURL": "grpc://40.113.244.34:9051",
            "eventURL": "grpc://40.113.244.34:9053"
        }
    \],
    "channel": "composerchannel",
    "mspID": "Org1MSP",
    "timeout": 300
}
EOF
PRIVATE_KEY="${DIR}"/composer/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/e65ea87937d71d1f65058325e68eab54c4cebe97e457c5b1bf81baec94ca0811_sk
CERT="${DIR}"/composer/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/Admin@org1.example.com-cert.pem
if composer card list -n PeerAdmin@hlfv1 > /dev/null; then
    composer card delete -n PeerAdmin@hlfv1
fi
composer card create -p /tmp/.connection.json -u PeerAdmin -c "${CERT}" -k "${PRIVATE_KEY}" -r PeerAdmin -r ChannelAdmin --file /tmp/PeerAdmin@hlfv1.card
composer card import --file /tmp/PeerAdmin@hlfv1.card 
rm -rf /tmp/.connection.json
echo "Hyperledger Composer PeerAdmin card has been imported"
composer card list