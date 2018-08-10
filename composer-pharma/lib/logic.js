/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/* global getParticipantRegistry getAssetRegistry getFactory */

/**
 * A shipment has been received by an wholesaler
 * @param {org.jio.pharma.ShipmentReceived} shipmentReceived - the ShipmentReceived transaction
 * @transaction
 */
async function payOut(shipmentReceived) {  // eslint-disable-line no-unused-vars
  
	if(shipmentReceived.isValid){
      const contract = shipmentReceived.shipment.contract;
      const shipment = shipmentReceived.shipment;
      const pills = shipmentReceived.shipment.pills_Id;
      let payOut = pills.unitPrice * pills.unitCount;
      console.log("Initial Payout without deductions is :" + payOut);

      console.log('Received at: ' + shipmentReceived.timestamp);
      console.log('Contract arrivalDateTime: ' + contract.arrivalDateTime);

      // set the status of the shipment
      shipment.status = 'ARRIVED';

      // if the shipment did not arrive on time the payout is zero
      if (shipmentReceived.timestamp > contract.arrivalDateTime) {
          payOut = 0;
          console.log('Late shipment');
      } else {
          // find the lowest temperature reading
          if (shipment.temperatureReadings) {
              // sort the temperatureReadings by centigrade
              shipment.temperatureReadings.sort(function (a, b) {
                  return (a.centigrade - b.centigrade);
              });
              const lowestReading = shipment.temperatureReadings[0];
              const highestReading = shipment.temperatureReadings[shipment.temperatureReadings.length - 1];
              let penalty = 0;
              console.log('Lowest temp reading: ' + lowestReading.centigrade);
              console.log('Highest temp reading: ' + highestReading.centigrade);

              // does the lowest temperature violate the contract?
              if (lowestReading.centigrade < contract.minTemperature) {
                  penalty += (contract.minTemperature - lowestReading.centigrade) * contract.minPenaltyFactor;
                  console.log('Min temp penalty: ' + penalty);
              }

              // does the highest temperature violate the contract?
              if (highestReading.centigrade > contract.maxTemperature) {
                  penalty += (highestReading.centigrade - contract.maxTemperature) * contract.maxPenaltyFactor;
                  console.log('Max temp penalty: ' + penalty);
              }

              // apply any penalities
              payOut -= (penalty * pills.unitCount);
              console.log("deductions : " + (penalty * pills.unitCount));

              if (payOut < 0) {
                  payOut = 0;
              }
          }
      }

      var NS = 'org.jio.pharma';
      // Store the ShipmentReceived transaction with the Shipment asset it belongs to
      //shipment.ShipmentReceived = shipmentReceived;

      var factory = getFactory();
      var shipmentReceivedEvent = factory.newEvent(NS, 'ShipmentReceivedEvent');
      var message = 'Shipment ' + shipment.$identifier + ' received';
      console.log(message);
      shipmentReceivedEvent.message = message;
      shipmentReceivedEvent.shipment = shipment;
      emit(shipmentReceivedEvent);

      console.log('payout after deductions: ' + payOut);
      contract.manufacturer.accountBalance += payOut*0.85;
      contract.shipper.accountBalance += payOut*0.15;
      contract.wholesaler.accountBalance -= payOut;

      console.log('Manufacturer: ' + contract.manufacturer.$identifier + ' new balance: ' + contract.manufacturer.accountBalance);
      console.log('Wholesaler: ' + contract.wholesaler.$identifier + ' new balance: ' + contract.wholesaler.accountBalance);
      console.log('Shipper: ' + contract.shipper.$identifier + ' new balance: ' + contract.shipper.accountBalance);

      // update the manufacturer's balance
      const manufacturerRegistry = await getParticipantRegistry('org.jio.pharma.Manufacturer');
      await manufacturerRegistry.update(contract.manufacturer);

      // update the wholesaler's balance
      const wholesalerRegistry = await getParticipantRegistry('org.jio.pharma.Wholesaler');
      await wholesalerRegistry.update(contract.wholesaler);

      // update the shipper's balance
      const shipperRegistry = await getParticipantRegistry('org.jio.pharma.Shipper');
      await shipperRegistry.update(contract.shipper);

      // update the state of the shipment
      const shipmentRegistry = await getAssetRegistry('org.jio.pharma.Shipment');
      await shipmentRegistry.update(shipment);
    }else{
      
      const shipment = shipmentReceived.shipment;
      const pill = shipmentReceived.shipment.pills_Id;
      const NS = 'org.jio.pharma';
      
      // set the status of the shipment
      shipment.status = 'ARRIVED';
      
      // set valid status to false
      shipment.validStatus = false;
      
      console.log('Pill id = ' + pill.pills_Id + ' shipmentReceived id = ' + shipmentReceived.invalidPills);
      if(pill.pills_Id === shipmentReceived.invalidPills){
        console.log("Setting pills validity to false.");
      	pill.validStatus = false;
        
        var factory = getFactory();
        const issueStatus = factory.newConcept(NS, 'IssueStatus');
        issueStatus.sender = 'PENDING';
        issueStatus.receiver = 'PENDING';
        
        pill.issue = issueStatus;
      }
      
      // update the state of the shipment
      const pillRegistry = await getAssetRegistry('org.jio.pharma.Pills');
      await pillRegistry.update(pill);
      
      // update the state of the shipment
      const shipmentRegistry = await getAssetRegistry('org.jio.pharma.Shipment');
      await shipmentRegistry.update(shipment);
    }
}

/**
 * When shipment has been packed & is ready for pickup
 * @param {org.jio.pharma.ShipmentPacked} shipmentPacked - the ShipmentPacked transaction
 * @transaction
 */
async function shipmentPacked(shipmentPacked) {  // eslint-disable-line no-unused-vars
	
    var NS = 'org.jio.pharma';
    const shipment = shipmentPacked.shipment;
    var factory = getFactory();
    var shipmentPackedEvent = factory.newEvent(NS, 'ShipmentPackedEvent');
    var message = 'Shipment ' + shipment.$identifier + ' packed';
    console.log(message);
    shipmentPackedEvent.message = message;
    shipmentPackedEvent.shipment = shipment;
    emit(shipmentPackedEvent);
 
    return getAssetRegistry('org.jio.pharma.Shipment').then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * When shipment has been pickedup & is ready for loading
 * @param {org.jio.pharma.ShipmentPickedup} shipmentPickedup - the ShipmentPickedup transaction
 * @transaction
 */
async function shipmentPickedup(shipmentPickedup) {  // eslint-disable-line no-unused-vars
	
    var NS = 'org.jio.pharma';
    const shipment = shipmentPickedup.shipment;
    var factory = getFactory();
    var shipmentPickedupEvent = factory.newEvent(NS, 'ShipmentPickedupEvent');
    var message = 'Shipment ' + shipment.$identifier + ' pickedup';
    console.log(message);
    shipmentPickedupEvent.message = message;
    shipmentPickedupEvent.shipment = shipment;
    emit(shipmentPickedupEvent);
 
    return getAssetRegistry('org.jio.pharma.Shipment').then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * When shipment has been loaded onto the cargo ship
 * @param {org.jio.pharma.ShipmentLoaded} shipmentLoaded - the ShipmentPacked transaction
 * @transaction
 */
async function shipmentLoaded(shipmentLoaded) {  // eslint-disable-line no-unused-vars
	
    var NS = 'org.jio.pharma';
    const shipment = shipmentLoaded.shipment;
    var factory = getFactory();
    var shipmentLoadedEvent = factory.newEvent(NS, 'ShipmentLoadedEvent');
    var message = 'Shipment ' + shipment.$identifier + ' loaded';
    console.log(message);
    shipmentLoadedEvent.message = message;
    shipmentLoadedEvent.shipment = shipment;
    emit(shipmentLoadedEvent);
 
    return getAssetRegistry('org.jio.pharma.Shipment').then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * When shipment arrived at the port
 * @param {org.jio.pharma.ShipmentInPort} shipmentInPort - the ShipmentInPort transaction
 * @transaction
 */
async function shipmentInPort(shipmentInPort) {  // eslint-disable-line no-unused-vars
	
    var NS = 'org.jio.pharma';
    const shipment = shipmentInPort.shipment;
    var factory = getFactory();
    var shipmentInPortEvent = factory.newEvent(NS, 'ShipmentInPortEvent');
    var message = 'Shipment ' + shipment.$identifier + ' inPort';
    console.log(message);
    shipmentInPortEvent.message = message;
    shipmentInPortEvent.shipment = shipment;
    emit(shipmentInPortEvent);
 
    return getAssetRegistry('org.jio.pharma.Shipment').then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * A temperature reading has been received for a shipment
 * @param {org.jio.pharma.TemperatureReading} temperatureReading - the TemperatureReading transaction
 * @transaction
 */
async function temperatureReading(temperatureReading) {  // eslint-disable-line no-unused-vars

    var shipment = temperatureReading.shipment;
    var deviceID = temperatureReading.deviceID;
    var NS = "org.jio.pharma";
    var contract = shipment.contract;
    var factory = getFactory();
    
    console.log('Adding DeviceID :' + deviceID + ', Adding temperature :' + temperatureReading.temperature + ', Adding time :' + temperatureReading.time + ', Adding humidity :' + temperatureReading.humidity +' to shipment ' + shipment.$identifier);
  
    if (shipment.temperatureReadings) {
        shipment.temperatureReadings.push(temperatureReading);
    } else {
        shipment.temperatureReadings = [temperatureReading];
    }
 
    if (temperatureReading.temperature < contract.minTemperature ||
        temperatureReading.temperature > contract.maxTemperature) {
        var temperatureEvent = factory.newEvent(NS, 'TemperatureThresholdEvent');
        temperatureEvent.shipment = shipment;
        temperatureEvent.temperature = temperatureReading.temperature;
        temperatureEvent.message = 'Temperature threshold violated for DeviceID :' + deviceID + '!!  Emitting TemperatureEvent for shipment: ' + shipment.$identifier;
        console.log(temperatureEvent.message);
        emit(temperatureEvent);
    }
 
    return getAssetRegistry('org.jio.pharma.Shipment').then(function (shipmentRegistry) {
            // add the temp reading to the shipment
            return shipmentRegistry.update(shipment);
        });
}

/**
 * A GPS reading has been received for a shipment
 * @param {org.jio.pharma.GpsReading} gpsReading - the GpsReading transaction
 * @transaction
 */
function gpsReading(gpsReading) {
 
    var factory = getFactory();
    var NS = "org.jio.pharma";
    var shipment = gpsReading.shipment;
    var PORT_OF_NEW_YORK = '/LAT:40.6840N/LONG:74.0062W';
     
    var latLong = '/LAT:' + gpsReading.latitude + gpsReading.latitudeDir + '/LONG:' +
        gpsReading.longitude + gpsReading.longitudeDir;
     
    if (shipment.gpsReadings) {
        shipment.gpsReadings.push(gpsReading);
    } else {
        shipment.gpsReadings = [gpsReading];
    }
 
    if (latLong == PORT_OF_NEW_YORK) {
        var shipmentInPortEvent = factory.newEvent(NS, 'ShipmentInPortEvent');
        shipmentInPortEvent.shipment = shipment;
        var message = 'Shipment has reached the destination port of ' + PORT_OF_NEW_YORK;
        shipmentInPortEvent.message = message;
        console.log(message);
        emit(shipmentInPortEvent);
    }
 
    return getAssetRegistry('org.jio.pharma.Shipment').then(function (shipmentRegistry) {
        // add the temp reading to the shipment
        return shipmentRegistry.update(shipment);
    });
}

/**
 * A GPS reading has been received for a shipment
 * @param {org.jio.pharma.issueResolved} issueResolved - the issueResolved transaction
 * @transaction
 */
async function issueResolved(issueResolved) {
  
  const factory = getFactory();
  
  let currentParticipant = getCurrentParticipant();
  let currentIdentity = getCurrentIdentity();
  
  const pill = issueResolved.shipment.pills_Id
  
  console.log('Pills ID = ' + pill.pills_Id + ' Issue Pill ID = ' + issueResolved.resolvedPill);
  if(pill.pills_Id === issueResolved.resolvedPill){
    
    console.log('Current Participant Type = ' + currentParticipant.getFullyQualifiedType());
    if (currentParticipant.getFullyQualifiedType() === 'org.jio.pharma.Manufacturer'){

    	pill.issue.sender = 'APPROVED'; 

    }else if(currentParticipant.getFullyQualifiedType() === 'org.jio.pharma.Wholesaler'){
     
     	pill.issue.receiver = 'APPROVED';	
      
    }
    
    // update the state of the pill
      const pillRegistry = await getAssetRegistry('org.jio.pharma.Pills');
      await pillRegistry.update(pill);
    
    if (pill.issue.sender === 'APPROVED' && pill.issue.receiver === 'APPROVED') {
    
      const contract = issueResolved.shipment.contract;
      const shipment = issueResolved.shipment;
      const pills = issueResolved.shipment.pills_Id;
      let payOut = pills.unitPrice * pills.unitCount;
      console.log("Initial Payout without deductions is :" + payOut);

      console.log('Received at: ' + issueResolved.timestamp);
      console.log('Contract arrivalDateTime: ' + contract.arrivalDateTime);

      // if the shipment did not arrive on time the payout is zero
      if (issueResolved.timestamp > contract.arrivalDateTime) {
          payOut = 0;
          console.log('Late shipment');
      } else {
          // find the lowest temperature reading
          if (shipment.temperatureReadings) {
              // sort the temperatureReadings by centigrade
              shipment.temperatureReadings.sort(function (a, b) {
                  return (a.centigrade - b.centigrade);
              });
              const lowestReading = shipment.temperatureReadings[0];
              const highestReading = shipment.temperatureReadings[shipment.temperatureReadings.length - 1];
              let penalty = 0;
              console.log('Lowest temp reading: ' + lowestReading.centigrade);
              console.log('Highest temp reading: ' + highestReading.centigrade);

              // does the lowest temperature violate the contract?
              if (lowestReading.centigrade < contract.minTemperature) {
                  penalty += (contract.minTemperature - lowestReading.centigrade) * contract.minPenaltyFactor;
                  console.log('Min temp penalty: ' + penalty);
              }

              // does the highest temperature violate the contract?
              if (highestReading.centigrade > contract.maxTemperature) {
                  penalty += (highestReading.centigrade - contract.maxTemperature) * contract.maxPenaltyFactor;
                  console.log('Max temp penalty: ' + penalty);
              }

              // apply any penalities
              payOut -= (penalty * pills.unitCount);
              console.log("deductions : " + (penalty * pills.unitCount));

              if (payOut < 0) {
                  payOut = 0;
              }
          }
      }

      var NS = 'org.jio.pharma';
      // Store the ShipmentReceived transaction with the Shipment asset it belongs to
      //shipment.ShipmentReceived = shipmentReceived;

      var shipmentReceivedEvent = factory.newEvent(NS, 'ShipmentReceivedEvent');
      var message = 'Shipment ' + shipment.$identifier + ' received';
      console.log(message);
      shipmentReceivedEvent.message = message;
      shipmentReceivedEvent.shipment = shipment;
      emit(shipmentReceivedEvent);

      console.log('payout after deductions: ' + payOut);
      contract.manufacturer.accountBalance += payOut*0.85;
      contract.shipper.accountBalance += payOut*0.15;
      contract.wholesaler.accountBalance -= payOut;
      
      pills.validStatus = true;
      shipment.validStatus = true;

      console.log('Manufacturer: ' + contract.manufacturer.$identifier + ' new balance: ' + contract.manufacturer.accountBalance);
      console.log('Wholesaler: ' + contract.wholesaler.$identifier + ' new balance: ' + contract.wholesaler.accountBalance);
      console.log('Shipper: ' + contract.shipper.$identifier + ' new balance: ' + contract.shipper.accountBalance);

      // update the manufacturer's balance
      const manufacturerRegistry = await getParticipantRegistry('org.jio.pharma.Manufacturer');
      await manufacturerRegistry.update(contract.manufacturer);

      // update the wholesaler's balance
      const wholesalerRegistry = await getParticipantRegistry('org.jio.pharma.Wholesaler');
      await wholesalerRegistry.update(contract.wholesaler);

      // update the shipper's balance
      const shipperRegistry = await getParticipantRegistry('org.jio.pharma.Shipper');
      await shipperRegistry.update(contract.shipper);

      // update the state of the shipment
      const shipmentRegistry = await getAssetRegistry('org.jio.pharma.Shipment');
      await shipmentRegistry.update(shipment);
      
      // update the state of the pill
      const pillRegistry = await getAssetRegistry('org.jio.pharma.Pills');
      await pillRegistry.update(pills);
      
    }
  }
 
function payOutHelper() {
	console.log('Bello');  
}
    
	 
}
/**
 * Initialize some test assets and participants useful for running a demo.
 * @param {org.jio.pharma.SetupDemo} SetupDemo - the SetupDemo transaction
 * @transaction
 */
async function SetupDemo(SetupDemo) {  // eslint-disable-line no-unused-vars

    const factory = getFactory();
    const NS = 'org.jio.pharma';

    // create the manufacturer
    const manufacturer = factory.newResource(NS, 'Manufacturer', 'manufacturer7@email.com');
    const manufacturerAddress = factory.newConcept(NS, 'Address');
    manufacturerAddress.country = 'USA';
    manufacturer.address = manufacturerAddress;
    manufacturer.accountBalance = 1000;

    // create the wholesaler
    const wholesaler = factory.newResource(NS, 'Wholesaler', 'wholesaler7@email.com');
    const wholesalerAddress = factory.newConcept(NS, 'Address');
    wholesalerAddress.country = 'UK';
    wholesaler.address = wholesalerAddress;
    wholesaler.accountBalance = 50000;

    // create the shipper
    const shipper = factory.newResource(NS, 'Shipper', 'shipper7@email.com');
    const shipperAddress = factory.newConcept(NS, 'Address');
    shipperAddress.country = 'Panama';
    shipper.address = shipperAddress;
    shipper.accountBalance = 200;

    // create the contract
    const contract = factory.newResource(NS, 'Contract', 'CON_001');
    contract.manufacturer = factory.newRelationship(NS, 'Manufacturer', 'manufacturer7@email.com');
    contract.wholesaler = factory.newRelationship(NS, 'Wholesaler', 'wholesaler7@email.com');
    contract.shipper = factory.newRelationship(NS, 'Shipper', 'shipper7@email.com');
    const tomorrow = SetupDemo.timestamp;
    tomorrow.setDate(tomorrow.getDate() + 1);
    contract.arrivalDateTime = tomorrow; // the shipment has to arrive tomorrow
    contract.minTemperature = 0; // min temperature for the cargo
    contract.maxTemperature = 20; // max temperature for the cargo
    contract.minPenaltyFactor = 0.1; // we reduce the price by 1000 dollars for every degree below the min temp
    contract.maxPenaltyFactor = 0.2; // we reduce the price by 2000 dollars for every degree above the max temp
    
    // create the pills 
    const pills = factory.newResource(NS, 'Pills', 'p7');
    pills.pills_Name = 'p7_name';
    pills.unitCount = 50;
    pills.unitPrice = 100;
    pills.composition = 'abc';
    const manufacture = SetupDemo.timestamp;
    manufacture.setDate(manufacture.getDate() - 1);
    pills.manufacturedDateTime = manufacture; 
    const expiry = SetupDemo.timestamp;
    expiry.setDate(expiry.getDate() + 365);
    pills.expiryDateTime = expiry; 
  	pills.validStatus = true;
  
    // create the pills 2
    //const pills2 = factory.newResource(NS, 'Pills', 'p7');
    //pills2.pills_Name = 'p7_name';
    //pills2.unitCount = 30;
    //pills2.unitPrice = 10;
    //pills2.composition = 'pqr';
    //const manufacture2 = SetupDemo.timestamp;
    //manufacture2.setDate(manufacture2.getDate() - 1);
    //pills2.manufacturedDateTime = manufacture2; 
    //const expiry2 = SetupDemo.timestamp;
    //expiry2.setDate(expiry2.getDate() + 365);
    //pills2.expiryDateTime = expiry2; 
  
    // create the shipment
    const shipment = factory.newResource(NS, 'Shipment', 'SHIP_001');
    shipment.type = 'ANTIBIOTICS';
    shipment.status = 'IN_TRANSIT';
    //shipment.pills_Id = [factory.newRelationship(NS, 'Pills', 'p6'), factory.newRelationship(NS, 'Pills', 'p7')];
    shipment.pills_Id = factory.newRelationship(NS, 'Pills', 'p7');
    shipment.contract = factory.newRelationship(NS, 'Contract', 'CON_001');
  	shipment.validStatus = true;
  
    // add the manufacturers
    const manufacturerRegistry = await getParticipantRegistry(NS + '.Manufacturer');
    await manufacturerRegistry.addAll([manufacturer]);

    // add the wholesalers
    const wholesalerRegistry = await getParticipantRegistry(NS + '.Wholesaler');
    await wholesalerRegistry.addAll([wholesaler]);
    
    // add the shippers
    const shipperRegistry = await getParticipantRegistry(NS + '.Shipper');
    await shipperRegistry.addAll([shipper]);

    // add the contacts
    const contractRegistry = await getAssetRegistry(NS + '.Contract');
    await contractRegistry.addAll([contract]);

    // add the shipments
    const shipmentRegistry = await getAssetRegistry(NS + '.Shipment');
    await shipmentRegistry.addAll([shipment]);
  
    // add the pills
    const pillsRegistry = await getAssetRegistry(NS + '.Pills');
    await pillsRegistry.addAll([pills]);
}