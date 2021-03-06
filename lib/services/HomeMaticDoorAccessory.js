
// this is just a template
const path = require('path')
const HomeMaticAccessory = require(path.join(__dirname, 'HomeMaticAccessory.js'))
const moment = require('moment')

class HomeMaticDoorAccessory extends HomeMaticAccessory {
  isTrue (value) {
    if (this.reverse === true) {
      return !super.isTrue(value)
    } else {
      return super.isTrue(value)
    }
  }

  publishServices (Service, Characteristic) {
    let self = this

    this.timesOpened = (this.getPersistentValue('timesOpened', 0))
    this.timeOpen = this.getPersistentValue('timeOpen', 0)
    this.timeClosed = this.getPersistentValue('timeClosed', 0)
    let settings = this.getDeviceSettings()
    this.reverse = (settings.reverse !== undefined) ? settings.reverse : false

    this.initAccessoryService(Service)

    // Enable all Eve Logging Services for this device
    this.enableLoggingService('door', false)

    // enable the last Opened Service
    this.addLastActivationService(this.service)

    this.addResetStatistics(this.service, () => {
      self.log.debug('[Door] reset Stats')
      if (self.tOC !== undefined) {
        self.timesOpened = 0
        self.savePersistentValue('timesOpened', self.timesOpened)
        self.tOC.updateValue(self.timesOpened, null)
      }
    })

    this.tOC = this.addStateBasedCharacteristic(this.service, this.eve.Characteristic.TimesOpened, () => {
      return self.timesOpened
    })

    this.oDC = this.addStateBasedCharacteristic(this.service, this.eve.Characteristic.OpenDuration, () => {
      return self.timeOpen
    })

    this.cDC = this.addStateBasedCharacteristic(this.service, this.eve.Characteristic.ClosedDuration, () => {
      return self.timeClosed
    })

    this.currentPosition = this.service.getCharacteristic(Characteristic.CurrentPosition)
      .on('get', (callback) => {
        self.getValueForDataPointNameWithSettingsKey('state', null, false).then(value => {
          if (callback) {
            let hmresult = self.getDataPointResultMapping('state', null, value)
            self.log.debug('[Door] getCurrentPosition HM is %s', hmresult)
            self.processPositionState(hmresult)
            callback(null, hmresult)
          }
        })
      })

    this.targetPosition = this.service.getCharacteristic(Characteristic.TargetPosition)
      .on('get', (callback) => {
        self.getValueForDataPointNameWithSettingsKey('state', null, false).then(value => {
          if (callback) {
            let hmresult = self.getDataPointResultMapping('state', null, value)
            self.log.debug('[Door] getTargetPosition HM is %s', hmresult)
            self.processPositionState(hmresult)
            callback(null, hmresult)
          }
        })
      })
      .on('set', (value, callback) => {
        // This is just a sensor so reset homekit data to ccu value after 1 second playtime
        setTimeout(() => {
          self.getValueForDataPointNameWithSettingsKey('state', null, true).then(value => {
            self.processPositionState(value)
          })
        }, 1000)

        if (callback) {
          callback()
        }
      })

    this.positionState = this.service.getCharacteristic(Characteristic.PositionState)
    this.positionState.on('get', (callback) => {
      if (callback) callback(null, Characteristic.PositionState.STOPPED)
    })

    this.registerAddressWithSettingsKeyForEventProcessingAtAccessory('state', null, (newValue) => {
      let mappedResult = self.getDataPointResultMapping('state', null, newValue)
      let historyResult = self.getDataPointResultMapping('state', null, newValue, 'history')
      self.log.debug('[Door] state Event %s -  mapped %s', newValue, mappedResult)
      if ((self.initialQuery === false) && (self.lastValue !== mappedResult)) {
        let now = moment().unix()
        if (mappedResult === 100) {
          self.timeClosed = self.timeClosed + (moment().unix() - self.timeStamp)
          self.timesOpened = self.timesOpened + 1
          self.tOC.updateValue(self.timesOpened, null)
          self.savePersistentValue('timesOpened', self.timesOpened)
          self.updateLastActivation()
          self.timeStamp = now
          self.oDC.updateValue(self.timeOpen, null)
        } else {
          self.timeOpen = self.timeOpen + (moment().unix() - self.timeStamp)
          self.cDC.updateValue(self.timeClosed)
        }
      }

      self.addLogEntry({
        status: historyResult
      })

      self.initialQuery = false
      self.lastValue = mappedResult
      self.processPositionState(mappedResult)
    })
  }

  processPositionState (isOpen) {
    this.log.debug('[Door] processing State %s', isOpen)
    if ((this.currentPosition !== undefined) && (this.targetPosition !== undefined) && (this.positionState !== undefined)) {
      this.log.debug('[Door] set to %s', isOpen)
      this.currentPosition.updateValue(isOpen, null)
      this.targetPosition.updateValue(isOpen, null)
      this.positionState.updateValue(2, null)
    }
  }

  initAccessoryService (Service) {
    this.service = this.getService(Service.Door)
  }

  initServiceSettings () {
    return {
      '*': {
        state: {name: 'STATE', boolean: true, mapping: {true: 100, false: 0}, history: {true: 1, false: 0}}
      }
    }
  }

  static channelTypes () {
    return ['CONTACT', 'SHUTTER_CONTACT']
  }

  static serviceDescription () {
    return 'This service provides a door based on a ccu contact in HomeKit'
  }

  static configurationItems () {
    return {
      'reverse': {
        type: 'checkbox',
        default: false,
        label: 'Reverse the values',
        hint: 'on is off and off is on'
      }
    }
  }
}
module.exports = HomeMaticDoorAccessory
