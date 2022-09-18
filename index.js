const Big 		= require("big.js"); // float safe math
const got 		= require("got"); // <!!!!  got@11 specific version
const ed25519 	= require('ed25519');
const crypto 	= require('crypto');
const bip39 	= require('bip39');

class BambooApi {

	/*
	
		Typical host format for bamboo node is http://xxx.xxx.xxx.xxx:3000
		
		All api calls return promises
	
	*/

	constructor(host) {
	
		this.apiUrl = host;

	}

	/*
	
		get current network status
	
	*/
	
	getNetworkInfo() {
		return new Promise((resolve, reject) => {
			(async () => {

				try {

					
					var body = await got.get(this.apiUrl + "/block_count").json();

					var height = body;

					var version = 1;

					var blockinfo = await this.getBlock(height);

					// Base Response, you may add additional info
					var inforesponse = {
						version: version,
						blockheight: height,
						lastblock: blockinfo.blocktime
					};

					resolve(inforesponse);

					
				} catch (e) {
					reject(e);
				}
				
			})();
		})
	}
	
	/*
	
		get block information by height
	
	*/

	getBlock(blockheight) {
		return new Promise((resolve, reject) => {
			(async () => {
			
				try {
				
					var body = await got.get(this.apiUrl + "/block?blockId=" + blockheight).json();	

					if (body && body.id)
					{
					
						const unhexlify = function(str) { 
						  var result = [];
						  while (str.length >= 2) { 
							result.push(parseInt(str.substring(0, 2), 16));
							str = str.substring(2, str.length);
						  }
						  return new Uint8Array(result);
						}
					
						const generateBlockHash = function(block) {
							let ctx = crypto.createHash('sha256');
							ctx.update(unhexlify(block["merkleRoot"]));
							ctx.update(unhexlify(block["lastBlockHash"]));

							let hexdiff = Buffer.from(parseInt(block["difficulty"]).toString(16).padStart(8, '0'), 'hex');
							let hexdiffa = Buffer.from(hexdiff).toJSON().data;
							hexdiffa.reverse();
							let swapdiff = Buffer.from(hexdiffa).toString('hex');
							ctx.update(unhexlify(swapdiff));

							let hextimestamp = Buffer.from(parseInt(block["timestamp"]).toString(16).padStart(16, '0'), 'hex');
							let hextimestampa = Buffer.from(hextimestamp).toJSON().data;
							hextimestampa.reverse();
							let swaptimestamp = Buffer.from(hextimestampa).toString('hex');
							ctx.update(unhexlify(swaptimestamp));

							let blockHash = ctx.digest('hex');
							return blockHash;
						}

						// Base Response, you may add additional info
						var inforesponse = {
							height: body.id,
							blockhash: generateBlockHash(body),
							blocktime: new Date(body.timestamp * 1000),
							transactions: body.transactions,
							raw: body
						};

						resolve(inforesponse);
				
					}
					else
					{
				
						reject("Not Found");
				
					}
				

				
				} catch (e) {
					reject(e);
				}
				
			})();
		})
	}
	
	/*
	
		Transaction information returned in a "bitcoiny" type format
	
	*/

	getTransaction(transactionid) {
		return new Promise((resolve, reject) => {
			(async () => {
			
				try {
				
					transactionid = transactionid.toUpperCase();

					var body = await got.post(this.apiUrl + "/verify_transaction", {json: [{"txid": transactionid}]}).json();	

					var seederAddress = "";

					if (body[0].status == "IN_CHAIN")
					{
					
						let blockInfo;
						let blockTrx = [];
						
						try {
						
							blockInfo = await this.getBlock(body[0].blockId);
							blockTrx = blockInfo.transactions;
						
						} catch (e) {
						
							reject('Not Found');
							
						}

						
						for (let i = 0; i < blockTrx.length; i++)
						{
						
							let thisTx = blockTrx[i];

							if (thisTx.txid == transactionid && thisTx.from != seederAddress)
							{

								var tdetails = [];

								var ddetails = {
									amount: Big(thisTx.amount).div(10**4).toFixed(4),
									fee: Big(thisTx.fee).div(10**4).toFixed(4),
									type: thisTx.from==''?"generate":"transfer",
									fromaddress: thisTx.from,
									toaddress: thisTx.to
								};
			
								tdetails.push(ddetails);
								
								var confirmations = 0;
								
								try {
								
									var currentNetworkInfo = await this.getNetworkInfo();
									confirmations = currentNetworkInfo.blockheight - blockInfo.height;
									
								} catch (e) {
								
								}

								var status = 'pending';
								if (confirmations > 0) status = 'confirmed';
								if (confirmations < 0) status = 'error';

								var transinfo = {
									totalamount: Big(thisTx.amount).div(10**4).toFixed(4),
									blockhash: blockInfo.blockhash,
									blocknumber: blockInfo.height,
									txid: thisTx.txid,
									id: thisTx.txid,
									fee: Big(thisTx.fee).div(10**4).toFixed(4),
									status: status,
									confirmations: confirmations,
									timestamp: {
										human: new Date(thisTx.timestamp * 1000).toLocaleString("en-US"),
										unix: parseInt(thisTx.timestamp)
									},
									details: tdetails,
									raw: thisTx
								};

								resolve(transinfo);

								break;
							
							}

						}
					
						reject('Not Found');
					
					}
					else
					{
					
						reject('Not Found');
					
					}

					
				} catch (e) {
					reject(e);
				}
				
			})();
		})
	}
	
	/*
	
		Returns human readable balance for an address
	
	*/

	getBalance(address) {
		return new Promise((resolve, reject) => {
			(async () => {

				try {

					var body = await got.get(this.apiUrl + "/ledger?wallet=" + address).json();	

					var balance = Big(body.balance).div(10**4).toFixed(8);

					resolve(balance);

				} catch (e) {
					resolve("0");
				}
				
			})();
		})
	}
	

	
	/*
	
		fee just seems to be a static 0.0001 right now
	
	*/

	getFeeEstimate() {
		return new Promise((resolve, reject) => {
			(async () => {

				try {

					var feeestimate = '0.0001';
					
					resolve(feeestimate);

				} catch (e) {
					reject(e);
				}
				
			})();
		})
	}
	
	/*
	
		signedTxArray:   an array of signed transactions created using bamboo crypto
	
	*/
	
	submitTransaction(signedTxArray) {
		return new Promise((resolve, reject) => {
			(async () => {

				try {
					
					var body = await got.post(this.apiUrl + "/add_transaction_json", {json: signedTxArray}).json();	

					resolve(body);
	
				} catch (e) {
					reject(e);
				}
				
			})();
		})
	}

	/*
	
		Get all transactions for a given address
	
	*/
	getTransactionsForAddress(address) {
	
		return new Promise((resolve, reject) => {
			(async () => {


				const checkAddress = function(transaction) {

					return transaction.to == address || transaction.from == address;

				}

				try {
				
					let transactionList = [];
					
					let getaccountTransactions = await got(this.apiUrl + "/wallet_transactions?wallet=" + address).json();
		
					getaccountTransactions.sort((a, b) => {
						return b.timestamp - a.timestamp;
					});
		
					transactionList = getaccountTransactions.filter(checkAddress);

					let pendingTransactions = await got(this.apiUrl + "/tx_json").json();
					pendingTransactions = pendingTransactions.filter(checkAddress);

					for (let i = 0; i < pendingTransactions.length; i++)
					{
		
						let thisTx = pendingTransactions[i];
						thisTx.pending = true;
			
						transactionList.unshift(thisTx);
		
					}

					resolve(transactionList);
	
				} catch (e) {
					reject(e);
				}
				
			})();
		})
	
	}
	
	/*
	
		filter is an array of addresses you would like to get a report on..  presumably addresses you own or ALL of you leave it empty
	
	*/
	getRecentTransactions(filter = [], blocksBack = 5) {
		return new Promise((resolve, reject) => {
			(async () => {

				try {
				
					var lastblock = await got.get(this.apiUrl + "/block_count").json();

					if (lastblock && lastblock > 0)
					{
					
						// block time is 90 seconds
					
						var newtxlist = [];
					
						var fromblock = lastblock - blocksBack;
						var toblock = lastblock
						
						for (let i = fromblock; i <= toblock; i++)
						{
						
							var thisBlockNumber = i;
							
							var blockInfo;
							
							try {

								blockInfo = await got.get(this.apiUrl + "/block?blockId=" + i).json();	

							} catch (e) {
							
							
							}
							
							if (blockInfo.transactions)
							{

								for (let j = 0; j < blockInfo.transactions.length; j++)
								{
					
									var txinfo = blockInfo.transactions[j];
						
									try {
																			
										if (filter.length == 0 || filter.indexOf(txinfo.to) > -1 || filter.indexOf(txinfo.from) > -1)
										{
										
											let confirmations = lastblock - i;

											let newtx = {
												id: txinfo.txid.toUpperCase(),
												fromAddress: txinfo.from,
												toAddress: txinfo.to,
												type: txinfo.from==''?"generate":"transfer",
												amount: Big(txinfo.amount).div(10**4).toFixed(4),
												fee: Big(txinfo.fee).div(10**4).toFixed(4),
												confirmations: confirmations
											};	

											newtxlist.push(newtx);
								
										}				

									} catch (e) {
						
						
									}

								}
					

							}

						}
		
						resolve(newtxlist);
					
					}
					else
					{
					
						reject("Unable to get last block count");
					
					}
					

				} catch (e) {
					reject(e);
				}
				
			})();
		})
	}

}

class BambooCrypto {

	constructor() {

	}
	
	/*

		generates a new address - should store the sensitive stuff encrypted
		
	*/

	generateNewAddress(password = "") {

		const pad = function(n, width, z) {
		  z = z || '0';
		  n = n + '';
		  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
		}

		try {

			let mnemonic = bip39.generateMnemonic()
			
			let seed = bip39.mnemonicToSeedSync(mnemonic, password);
			
			let seedhash = crypto.createHash('sha256').update(seed).digest(); //returns a buffer

			let keyPair = ed25519.MakeKeypair(seedhash);

			let bpublicKey = Buffer.from(keyPair.publicKey.toString("hex").toUpperCase(), "hex");

			let hash = crypto.createHash('sha256').update(bpublicKey).digest();

			let hash2 = crypto.createHash('ripemd160').update(hash).digest();

			let hash3 = crypto.createHash('sha256').update(hash2).digest();

			let hash4 = crypto.createHash('sha256').update(hash3).digest();

			let checksum = hash4[0];

			let addressArray = [];

			addressArray[0] = '00';
			for(let i = 1; i <= 20; i++) 
			{
				addressArray[i] = pad(hash2[i-1].toString(16), 2);
			}
			addressArray[21] = pad(hash4[0].toString(16), 2);
			addressArray[22] = pad(hash4[1].toString(16), 2);
			addressArray[23] = pad(hash4[2].toString(16), 2);
			addressArray[24] = pad(hash4[3].toString(16), 2);

			let address = addressArray.join('').toUpperCase();

			let newAccount = {
				address: address,
				seed: seed.toString("hex").toUpperCase(),
				mnemonic: mnemonic,
				seedPassword: password,
				publicKey: keyPair.publicKey.toString("hex").toUpperCase(),
				privateKey: keyPair.privateKey.toString("hex").toUpperCase()
			};
			
			return newAccount;

		} catch (e) {
console.log(e);
			return false;
		}

	}
	
	generateAddressFromMnemonic(mnemonic, password = "") {

		let isValid = bip39.validateMnemonic(mnemonic);

		if (isValid == false)
		{
		
			return false;
		
		}
		else
		{
						
			const pad = function(n, width, z) {
			  z = z || '0';
			  n = n + '';
			  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
			}

			try {

				let seed = bip39.mnemonicToSeedSync(mnemonic, password);

				let seedhash = crypto.createHash('sha256').update(seed).digest(); //returns a buffer

				let keyPair = ed25519.MakeKeypair(seedhash);

				let bpublicKey = Buffer.from(keyPair.publicKey.toString("hex").toUpperCase(), "hex");

				let hash = crypto.createHash('sha256').update(bpublicKey).digest();

				let hash2 = crypto.createHash('ripemd160').update(hash).digest();

				let hash3 = crypto.createHash('sha256').update(hash2).digest();

				let hash4 = crypto.createHash('sha256').update(hash3).digest();

				let checksum = hash4[0];

				let addressArray = [];

				addressArray[0] = '00';
				for(let i = 1; i <= 20; i++) 
				{
					addressArray[i] = pad(hash2[i-1].toString(16), 2);
				}
				addressArray[21] = pad(hash4[0].toString(16), 2);
				addressArray[22] = pad(hash4[1].toString(16), 2);
				addressArray[23] = pad(hash4[2].toString(16), 2);
				addressArray[24] = pad(hash4[3].toString(16), 2);

				let address = addressArray.join('').toUpperCase();

				let newAccount = {
					address: address,
					seed: seed.toString("hex").toUpperCase(),
					mnemonic: mnemonic,
					seedPassword: password,
					publicKey: keyPair.publicKey.toString("hex").toUpperCase(),
					privateKey: keyPair.privateKey.toString("hex").toUpperCase()
				};
			
				return newAccount;

			} catch (e) {
				return false;
			}
			
		}
	
	}
	
	/*
	
		just a regex test to make sure it is 50 characters hex
	
	*/
	
	validateAddress(address) {

		try {

			var pattern = /^[a-fA-F0-9]{50}$/;
			
			var isvalid = pattern.test(address);
			
			return isvalid;

		} catch (e) {
			return false;
		}

	}
	
	/*
	
		create and sign a transaction for submitting to the api
	
	*/
	
	createSignedTransaction(toAddress, humanAmount, publicKey, privateKey) {
	
		if (this.validateAddress(toAddress) == false) return false;
	
		try {
		
			const pad = function(n, width, z) {
			  z = z || '0';
			  n = n + '';
			  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
			}

			const unhexlify = function(str) { 
			  var result = [];
			  while (str.length >= 2) { 
				result.push(parseInt(str.substring(0, 2), 16));
				str = str.substring(2, str.length);
			  }
			  return new Uint8Array(result);
			}
						
			let formatAmount = parseInt(Big(humanAmount).times(10**4).toFixed(0));
			let nonce = Date.now();
			let fee = 1;

			let keyPair = {
				publicKey: Buffer.from(publicKey, 'hex'),
				privateKey: Buffer.from(privateKey, 'hex')
			}

			let trxTimestamp = Date.now();

			let hash = crypto.createHash('sha256').update(keyPair.publicKey).digest();

			let hash2 = crypto.createHash('ripemd160').update(hash).digest();

			let hash3 = crypto.createHash('sha256').update(hash2).digest();

			let hash4 = crypto.createHash('sha256').update(hash3).digest();

			let checksum = hash4[0];

			let addressArray = [];

			addressArray[0] = '00';
			for(let i = 1; i <= 20; i++) 
			{
				addressArray[i] = pad(hash2[i-1].toString(16), 2);
			}
			addressArray[21] = pad(hash4[0].toString(16), 2);
			addressArray[22] = pad(hash4[1].toString(16), 2);
			addressArray[23] = pad(hash4[2].toString(16), 2);
			addressArray[24] = pad(hash4[3].toString(16), 2);

			let fromAddress = addressArray.join('').toUpperCase();
			
			let tx = {
						"from": fromAddress, 
						"to": toAddress, 
						"fee": fee,
						"amount": formatAmount, 
						"timestamp": trxTimestamp
					};

			let ctx = crypto.createHash('sha256');
	
			ctx.update(unhexlify(tx["to"]));
	
			ctx.update(unhexlify(tx["from"]));

			let hexfee = Buffer.from(parseInt(tx["fee"]).toString(16).padStart(16, '0'), 'hex');
			let hexfeea = Buffer.from(hexfee).toJSON().data;
			hexfeea.reverse();
			let swapfee = Buffer.from(hexfeea).toString('hex');
			ctx.update(unhexlify(swapfee));


			let hexamount = Buffer.from(parseInt(tx["amount"]).toString(16).padStart(16, '0'), 'hex');
			let hexamounta = Buffer.from(hexamount).toJSON().data;
			hexamounta.reverse();
			let swapamount = Buffer.from(hexamounta).toString('hex');
			ctx.update(unhexlify(swapamount));

			let hextimestamp = Buffer.from(parseInt(tx["timestamp"]).toString(16).padStart(16, '0'), 'hex');
			let hextimestampa = Buffer.from(hextimestamp).toJSON().data;
			hextimestampa.reverse();
			let swaptimestamp = Buffer.from(hextimestampa).toString('hex');
			ctx.update(unhexlify(swaptimestamp));
	
			let txc_hash = ctx.digest();

			let signature = ed25519.Sign(txc_hash, keyPair); //Using Sign(Buffer, Keypair object)

			let sig2 = signature.toString('hex').toUpperCase();

			let tx_json = {
						"amount": tx.amount, 
						"fee": tx.fee, 
						"from": tx.from,
						"signature": sig2,
						"signingKey": publicKey, 
						"timestamp": String(tx.timestamp),
						"to": tx.to
						};
	
			return tx_json;
		
		} catch (e) {
		
console.log(e);
		
			return false;
		}
	
	}
	
	/*
	
		Sign a message using your keyPair
	
	
	*/
	
	signMessage(message, publicKey, privateKey) {
	
		try {

			let keyPair = {
				publicKey: Buffer.from(publicKey, 'hex'),
				privateKey: Buffer.from(privateKey, 'hex')
			}

			let signature = ed25519.Sign(Buffer.from(message, 'utf8'), keyPair); //Using Sign(Buffer, Keypair object)

			let sig2 = signature.toString('hex').toUpperCase();
			
			return sig2;


		} catch (e) {

			return false;

		}
	
	}

	/*
	
		Validate a message using publickey and signature
	
	
	*/
	
	verifyMessage(message, publicKey, signature) {
	
		if (ed25519.Verify(Buffer.from(message, 'utf8'), Buffer.from(signature, 'hex'), Buffer.from(publicKey, 'hex'))) {
		
			return true;
			
		} else {
		
			return false;
			
		}
	
	}

	/*
	
		Validate a message using publickey and signature
	
	
	*/
	
	walletAddressFromPublicKey(publicKey) {
	
		try {

			const pad = function(n, width, z) {
			  z = z || '0';
			  n = n + '';
			  return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
			}
			
			let bpublicKey = Buffer.from(publicKey, "hex");
	
			let hash = crypto.createHash('sha256').update(bpublicKey).digest();

			let hash2 = crypto.createHash('ripemd160').update(hash).digest();

			let hash3 = crypto.createHash('sha256').update(hash2).digest();

			let hash4 = crypto.createHash('sha256').update(hash3).digest();
	
			let checksum = hash4[0];
	
			let address = [];
	
			address[0] = '00';
			for(let i = 1; i <= 20; i++) 
			{
				address[i] = pad(hash2[i-1].toString(16), 2);
			}
			address[21] = pad(hash4[0].toString(16), 2);
			address[22] = pad(hash4[1].toString(16), 2);
			address[23] = pad(hash4[2].toString(16), 2);
			address[24] = pad(hash4[3].toString(16), 2);
	
			return address.join('').toUpperCase();
    
    	} catch (e) {
    		return false;
    	}
	
	}

}

module.exports = {api: BambooApi, crypto: BambooCrypto};
