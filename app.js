require.paths.unshift('./.node_libraries');

var sys = require('sys'),
	express = require('express'),
	redis = require("redis");
    
var redPublisher = redis.createClient();
var redSubscribers = {},
	redXdrTimeOutReq = {},
	redSubscribersTimeKeeper = {},
	redPollers = {},
	redPollersTimeKeeper = {};

var app = express.createServer();


app.configure(function(){
    app.use(express.methodOverride());
    app.use(express.bodyDecoder());
    app.use(app.router);
	app.set('view engine', 'ejs');
	app.set('view options', {
	    layout: false
	});
    app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
	redPublisher.flushdb();
});


// TODO: purge RedisClients that are inactive!!!

/*
function purgeCall(channel)
{
	clearTimeout(redSubscribersTimeKeeper[channel]);
	redSubscribersTimeKeeper[channel] = setTimeout(function()
	{
		if (typeof redSubscribers[channel] !== 'undefined')
		{
			redSubscribers[channel].unsubscribe();
		}
		if (typeof redPollers[channel] !== 'undefined')
		{
			redPollers[channel].unsubscribe();
		}
	} , 60000);
}
*/

app.get('/pubnub.js', function(req, res)
{
	//res.contentType('text/javascript');
	res.render('pubnub.ejs', {
		locals: {
			hostname: process.argv[4],
			port: process.argv[3]
		}
	});
});

app.get('/pubnub-x-origin', function(req, res) 
{
	var unique = req.param("unique");

	pubnubResponse = {
		"x-origin": 1
	}
	
    res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' }, 200);
});

app.get('/pubnub-time', function(req, res) 
{
	var unique = req.param("unique");
	
	pubnubResponse = {
		status: 200,
		time: (+new Date)
	}
	
    res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' }, 200);
});

app.get('/pubnub-uuid', function(req, res) 
{
	var unique = req.param("unique");	
	
    var generate = function(l)
	{
		var result = "";
		for (var i=0; i<l; i++)
		{
			var rand = Math.floor(Math.random(+new Date)*16);
			result += String.fromCharCode(48 + (rand<10?rand:rand+39) );
		}
		return result;
	}

	var pubnubResponse = {
		status: 200,
		uuid: (generate(8)+'-'+generate(4)+'-'+generate(4)+'-'+generate(4)+'-'+generate(12))
	}
	
    res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' }, 200);
});

// TODO: "/pubnub-publish?channel=" + this.SUBSCRIBE_KEY +"/" + channel + "&message=" + JSON.stringify(message) +"&publish_key=" + this.PUBLISH_KEY + "&unique=" + unique;
app.get('/pubnub-publish', function(req, res) 
{
	var channel = req.param("channel");
	var message = req.param("message");
	var unique = req.param("unique");
	
	// TODO: Check subscribe key & publish key

	console.log("received (ch "+ channel +"): "+ message);
	
	// We only need ONE redisClient in async to publish!
	redPublisher.publish(channel, message);

	var pubnubResponse = {
		status: 200
	};

	res.send('window["'+unique+'"](' + JSON.stringify(pubnubResponse) + ')', { 'Content-Type': 'application/javascript' },  200);
});

// TODO: "/pubnub-subscribe?channel=" + this.SUBSCRIBE_KEY +"/" + channel + "&unique=" + unique;
app.get('/pubnub-subscribe', function(req, res) 
{
	var channel = req.param("channel");
	var unique = req.param("unique");
	
	// We are not subscribing so let's do it!
	if (typeof redSubscribers[channel] === 'undefined')
	{
		console.log('/pubnub-subscribe (new): '+req.param("channel"));
		
		redSubscribers[channel] = redis.createClient();
		
		redSubscribers[channel].on("unsubscribe", 
			function (channel, count) 
			{
				console.log("purging inactive subscriber")
				redSubscribers[channel].end();
			}
		);
		
		redSubscribers[channel].on("subscribe", function(channel, count)
		{
			console.log("persistent redis client waiting for messages on:"+channel);
			
			redSubscribers[channel].on("message", function (channel, message) 
			{
				var timeToken = +new Date;
				var messageString = JSON.stringify(
					{
						timeToken: timeToken,
						message: message.toString()
					}
				);

				console.log("received redis message on channel:"+channel+"\\/\n"+messageString);

				redPublisher.zadd( channel, timeToken.toString(), messageString, 
					function(error, replies)
					{
						console.log("publishing redis message back on internal #channel!");
						redPublisher.publish('#' + channel, messageString);
					}
				);

			});
			
			res.send('window["'+unique+'"](' + JSON.stringify({status: 200, server: process.argv[4]+":"+process.argv[3]}) + ')', { 'Content-Type': 'application/javascript' },  200);
		})
		
		redSubscribers[channel].subscribe(channel);

	}
	// we are subscribing to just send a polite message
	else
	{
		var channel = req.param("channel");
		
		console.log('/pubnub-subscribe (keep-alive): '+channel);
		
		res.send('window["'+unique+'"](' + JSON.stringify({status: 200, server: process.argv[4]+":"+process.argv[3]}) + ')', { 'Content-Type': 'application/javascript' },  200);
	}
});


app.get('/', function(req, res)
{
	var channel = req.param("channel"),
		timeToken = req.param("timetoken") || 0,
		unique = req.param("unique"),
		uniqueHash = channel+'/'+timeToken+'/'+unique,
		tempRedisClient = redis.createClient(),
		isRedisSubscribing = 0,
		hasRedisReplied = 0,
		redisMessageStack = [];
		
	console.log("polling request for: " + uniqueHash);
	
	// Auto correct request with timeToken = 0, because they will get the whole history of channel!
	if (timeToken == 0)
	{
		timeToken = (+new Date) - 1;
		//console.log("auto corrected timeToken to: " + timeToken);
	}
	
	// Make sure we send a reply within 30 sec if nothing happens!
	redXdrTimeOutReq[uniqueHash] = setTimeout( function() 
		{ 
			// Treat Redis client with care!
			if (isRedisSubscribing) 
			{
				tempRedisClient.unsubscribe();
			}
			else
			{
				tempRedisClient.end();
			}
			
			// Create timeout message
			var messageString = JSON.stringify({
				messages : ['xdr.timeout'],
				timetoken: +new Date
			});
			
			// Send it!
			console.log("Xdr timeout for: "+uniqueHash);
			
			clearTimeout(redXdrTimeOutReq[uniqueHash]);
			delete redXdrTimeOutReq[uniqueHash];
			
			res.send('window["'+unique+'"]('+messageString+')', { 'Content-Type': 'application/javascript' }, 200);
		},
	30000);
	
	// Make sure we end properly our redis client!
	tempRedisClient.on("unsubscribe", 
		function (channel, count) 
		{
			tempRedisClient.end();
		}
	);
	
	// Now subscribe to internal channel!
	tempRedisClient.on("subscribe", 
		function(channel, count)
		{
			isRedisSubscribing = 1;
			
			// Ok, we are now subscribing, let's check if need to fire older messages queued up!
			redPublisher.zrangebyscore(channel, timeToken+1, "+inf", function(error, replies) 
			{
				if (replies !== null) 
				// We unsubscribe, and send the batch we have here!
				{
					tempRedisClient.unsubscribe();

					var messages = JSON.parse('['+replies.toString()+']');
					var maxTimeToken = 0;
					var messageList = [];

					for (var i=0; i<messages.length; i++)
					{
						if (messages[i].timeToken > maxTimeToken)
						{
							maxTimeToken = messages[i].timeToken;
						}

						messageList.push(JSON.parse(messages[i].message));
					}

					var messageString = JSON.stringify({
						messages : messageList,
						timetoken: maxTimeToken
					});

					//console.log('window["'+unique+'"]('+messageString+')');
					clearTimeout(redXdrTimeOutReq[uniqueHash]);
					delete redXdrTimeOutReq[uniqueHash];
					
					console.log("poll response for: "+uniqueHash+"\n"+ messageString);
					res.send('window["'+unique+'"]('+messageString+')', { 'Content-Type': 'application/javascript' }, 200);
				}
				else
				// No records in Redis, let's flag that it is OK to send 
				{
					hasRedisReplied = 1;
				}
			});
		}
	);


	var redisStackCallBack = null;

	// When we get messages make sure to only push back the ones > timeToken requested!
	tempRedisClient.on("message",
		function(channel, replies)
		{
			if (hasRedisReplied)
			{
				//Clear the callback!
				clearTimeout(redisStackCallBack);
				redisStackCallBack = null;  
				
				var messages = JSON.parse('['+replies.toString()+']');
				var maxTimeToken = 0;
				var messageList = [];

				console.log("debug (b4 stack): " + JSON.stringify(messages));

				for (var i=0; i<redisMessageStack.length; i++)
				{
					messages.unshift(redisMessageStack[i]);
				}

				delete redisMessageStack;
				
				console.log("debug (combined): "+ JSON.stringify(messages));
				
				for (var i=0; i<messages.length; i++)
				{
					if (messages[i].timeToken > maxTimeToken)
					{
						maxTimeToken = messages[i].timeToken;
					}

					//console.log(messages[i]);

					messageList.push(JSON.parse(messages[i].message));
				}

				var messageString = JSON.stringify({
					messages : messageList,
					timetoken: maxTimeToken
				});

				// Clean our client before sending back data to user!
				tempRedisClient.unsubscribe();
				
				// Clear the timeOut to make sure it does not execute!
				clearTimeout(redXdrTimeOutReq[uniqueHash]);
				delete redXdrTimeOutReq[uniqueHash];
				
				console.log("poll response for: "+uniqueHash+"\n"+ messageString);
				res.send('window["'+unique+'"]('+messageString+')', { 'Content-Type': 'application/javascript' }, 200);
			}
			else
			{
				var messages = JSON.parse('['+replies.toString()+']');
				
				for (var i=0; i<messages.length; i++)
				{
					redisMessageStack.push(messages[i]);
				}
				
				console.log("pushed into Redis Message Stack (previous zrange query not ready!)");
				console.log(JSON.stringify(redisMessageStack));
				
				redisStackCallBack = setTimeout(function()
				{
					console.log("redis stack callback firing for:"+channel);
					tempRedisClient.emit("message", channel, "");
				}, 50);
			}
		}
	);
	
	// Now we start listening!
	tempRedisClient.subscribe('#'+channel);
	

});

app.listen(process.argv[3]);

sys.log("pubnub server is now listening on: "+process.argv[2]+ ":" + process.argv[3]);