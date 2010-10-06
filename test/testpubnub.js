require.paths.unshift('./.node_libraries');

var msg_count = 0;

var redis = require('redis');

var client1 = redis.createClient();
var client2 = redis.createClient();

client1.on("subscribe", function (channel, count) {
    client2.publish("demo/demo", "I am sending a message.");
    client2.publish("demo2/demo2", "I am sending a second message.");
    client2.publish("demo3/demo3", "I am sending my last message.");
});

client1.on("message", function (channel, message) {
    console.log("client1 channel " + channel + ": " + message);
    msg_count += 1;
    if (msg_count === 3) {
        client1.unsubscribe();
        client1.end();
        client2.end();
    }
});

//client1.incr("did a thing");
client1.subscribe("demo/demo");