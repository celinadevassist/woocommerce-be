// token
// EAAJWHN8W5qUBOZB5u92GCeHRnlB6n6zbi6N6fWZBwSOjofrOMhdEHZBuWwZB6p8yBNSPZC8JDZBWEZBL9Bsh8Yxi7YiivLcjS6xFbacDwBewL08rEOXWAW2gf4zkGzDeFPksDb5uAFbYmqq0fFIjus2Ec1WEsKY6dR5SnW0oHTTw1yg8aJyACMtZBn8AKjpwLGX7MAZDZD
// async fbPixelTrackCart(filter) {

//     // const gender = this.hashString('m');

//     const pixelId = `1296206827653896`
//     const apiVersion = `v13.0`
//     const accessToken = `EAAJWHN8W5qUBO84S14f6sXLJEVC3s4MbwgCtdr9poDwgxlqW972ThYinFoMShiB3rFZBQTgJfp7Wq2FIcwuMb4HZCw5DKuMv0rF39ZCqnjkydvP6HEoixiZBG7lCMMsE9s9UqbuE05ZA7sd01fkLgJpjyZBuid0Da6CNY6z6nL5Y6ZBDNKqoFsfPAzKrB6ZA8qiiUQZDZD`

//     const url = `https://graph.facebook.com/${apiVersion}/${pixelId}/events`;

//     // const arrayIds = filter._id.split(",")

//     let result = await this.SPSCartModel.find({
//         $and: [
//             { event_name: { $in: ["View Content", "Add To Cart"] } },
//             { fbpCookieValue: { $nin: [null] } },
//             { updatedAt: { $gt: filter.updatedAt } } // Adjust the date as needed
//         ]
//     }
//     ).sort({ updatedAt: -1 });
//     // return result
//     let eventsList = []
//     for (let record of result) {
//         let payload = {}
//         if (record?.userAgent) {
//             // Create a Date object from the 'createdAt' string
//             let createdAt
//             // time must be in GMT for Facebook
//             switch (record.event_name) {
//                 case "View Content":
//                     createdAt = new Date(record?.pageViewTime || record?.updatedAt);
//                     createdAt = new Date(createdAt.getTime() + (2 * 60 * 60 * 1000));

//                     break;
//                 case "Add to Cart":
//                     createdAt = new Date(record?.addToCartTime || record?.updatedAt);
//                     createdAt = new Date(createdAt.getTime() + (2 * 60 * 60 * 1000));
//                     break;
//                 default:
//                     break;
//             }
//             // Convert the Date object to time in milliseconds
//             let timeInMilliseconds = createdAt.getTime();
//             // Convert the time to seconds
//             let timeInSeconds = Math.floor(timeInMilliseconds / 1000);
//             let country = this.hashString('eg');
//             // let phone = this.hashString(`2${record.mobile}`);
//             // let email = record?.email ? this.hashString(`2${record?.email}`) : null;
//             payload = {
//                 "event_name": record.event_name,
//                 "event_time": timeInSeconds,
//                 "action_source": "website",
//                 "event_source_url": "https://reeshsleep.com",
//                 "event_id": record._id.toString(), //prevent duplication
//                 "user_data": {
//                     "em": [
//                         // email
//                     ],
//                     "ph": [
//                         // phone
//                     ],
//                     "country": [
//                         country
//                     ],

//                     "external_id": [
//                         // phone
//                     ],
//                     "client_user_agent": record.userAgent,
//                 },
//                 // "custom_data": {
//                 //     "currency": "EGP",
//                 //     "value": 650
//                 // }
//             }
//             if (record?.ipAddress)
//                 payload["user_data"]["client_ip_address"] = record?.ipAddress
//             if (record?.fbpCookieValue)
//                 payload["user_data"]["fbc"] = record?.fbpCookieValue
//             if (record?.fbcCookieValue)
//                 payload["user_data"]["fbp"] = record?.fbcCookieValue

//             if (payload["user_data"]["fbp"])
//                 eventsList.push(payload)

//         }
//     }
//     if (eventsList.length)
//         try {
//             let response = await axios.post(url, {
//                 data: eventsList,
//                 access_token: accessToken,
//             }, {
//                 headers: {
//                     'Content-Type': 'application/json',
//                 },
//             });
//             console.log(response)
//         } catch (error) {
//             console.log(error)
//             console.error('Error tracking purchase event:', error.message);
//         }
//     let updatedAt
//     try {
//         updatedAt = result[0]?.updatedAt || ""
//     } catch (error) {
//         updatedAt = ""
//     }
//     // console.log({ updatedAt: updatedAt, records: result })
//     return { updatedAt: updatedAt, records: result }
// }