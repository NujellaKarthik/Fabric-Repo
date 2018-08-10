#!/usr/bin/env python

# Import ServiceBus and Message Services
from azure.servicebus import ServiceBusService
from azure.servicebus import Message

# Opens the ServiceBusService
def createSBS():
	# Name of ServiceBus
	service_namespace = 'RaspberryPiDevices' 
	# SharedAccessKeyName
	key_name = 'RootManageSharedAccessKey' 
	# SharedAccessKey
	key_value = '72EXb4OOp/23v0OyTjJ8FUXP2EGYup41Fz4Q9oRMTXI=' 

	sbs = ServiceBusService(service_namespace, shared_access_key_name=key_name, shared_access_key_value=key_value)
	return sbs

# Gets the Raspberry Pi 3 Model B's serial number
def getId():
	iD = "0000000000000000"
	try:
		f = open('/proc/cpuinfo','r')
		for line in f:
			if line[0:6]=='Serial':
				iD = line[10:26]
		f.close()
	except:
		iD = "ERROR00000000000"
		f.close()
	return iD
