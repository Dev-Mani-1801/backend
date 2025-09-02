Generate a Test Wallet

node -e "import { Wallet } from 'ethers'; const wallet = Wallet.createRandom(); console.log('Mnemonic:', wallet.mnemonic.phrase); console.log('Address:', wallet.address); console.log('Private Key:', wallet.privateKey);"


Test Wallet 1: 

Mnemonic: motion load club skin proud muscle stone panel vessel dose lab hole
Address: 0x8cFc3BD1B4e17f8373864DbfF5318ED020b8B916
Private Key: 0x6484206063fe860f62b4179ccaac853486b54faa031c8965b6a0584033998c62


################################################### BTC Wallets ################################################### 

Main Master Wallet: 

Mnemonic: sunny fold just solar mad vacuum jealous scrub party lobster huge bicycle
Testnet BTC Address: tb1q3les4jsyusjys9544kzxhnfy9zrkc3cp6c4ck2
Private Key (WIF): cTDLE2zGfZ3oYBxdLWkRAiXoZj89Q4dEQhHvhGz5Z6CFfqbLXZEr

User 1:

Mnemonic: people noble label chronic beef thumb liquid bunker once poem injury ring
Private Key (WIF): cMjtkT3jy6cfmd2XSrX5ejTszXem77dVochHzyMBLep7PZ2jb8pU
Testnet BTC Address: tb1qdvyjnrhx8dk97sn5eyxktudrr7yh49tqxs6af6

User 2: 

Mnemonic: language balcony desk south forward actor claw artwork gossip swarm vacuum parent
Private Key (WIF): cN2a6GmRx2jVmm7m37geEUZUTReuAjR1iZSDPkCKqGukVf13JpFj
Testnet BTC Address: tb1q6e20ms8k83t7fgrr8wweleqjnyennvhyf82czv

------------------------------------------------------------------------------------------

~/.bitcoin/bitcoin.conf

server=1
txindex=1

[test]
rpcuser=btcuser
rpcpassword=btcpass_please_change_me
rpcbind=127.0.0.1
rpcallowip=127.0.0.1
rpcport=18332

zmqpubrawtx=tcp://127.0.0.1:28332
zmqpubrawblock=tcp://127.0.0.1:28333



