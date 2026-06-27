const IotDevice = require('../../models/IotDevice');

class IotService {
  async getAllDevices() {
    try {
      const devices = await IotDevice.find({});
      for (const device of devices) {
        await device.save();
      }
      return devices;
    } catch (error) {
      throw new Error('Error fetching IoT devices: ' + error.message);
    }
  }

  async getDeviceById(id) {
    try {
      let query = { device_code: id };
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        query = { $or: [{ _id: id }, { device_code: id }] };
      }
      const device = await IotDevice.findOne(query);
      if (!device) {
        throw new Error('Device not found');
      }
      return device;
    } catch (error) {
      throw new Error('Error fetching device details: ' + error.message);
    }
  }

  async addDevice(deviceData) {
    try {
      const newDevice = new IotDevice(deviceData);
      await newDevice.save();
      return newDevice;
    } catch (error) {
      throw new Error('Error adding IoT device: ' + error.message);
    }
  }
  async updateTelemetry(deviceId, waterLevel, batteryPercent, now) {
    try {
      const device = await IotDevice.findOne({ device_code: deviceId });
      if (!device) return null;
      if (device.is_disabled) return device;

      device.current_water_level = waterLevel;
      device.current_battery_level = batteryPercent;
      device.last_reading_time = now;
      device.last_ping = now;
      device.status = 'Online';
      
      await device.save();
      return device;
    } catch (error) {
      throw new Error('Error updating telemetry: ' + error.message);
    }
  }

  async toggleDeviceDisabled(id, isDisabled) {
    try {
      let query = { device_code: id };
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        query = { $or: [{ _id: id }, { device_code: id }] };
      }
      const device = await IotDevice.findOneAndUpdate(
        query,
        { $set: { is_disabled: isDisabled } },
        { new: true }
      );
      if (!device) throw new Error('Device not found');
      return device;
    } catch (error) {
      throw new Error('Error toggling device disabled state: ' + error.message);
    }
  }

  async updateDevice(id, updateData) {
    try {
      let query = { device_code: id };
      if (id.match(/^[0-9a-fA-F]{24}$/)) {
        query = { $or: [{ _id: id }, { device_code: id }] };
      }
      const device = await IotDevice.findOne(query);
      if (!device) throw new Error('Device not found');

      Object.assign(device, updateData);
      await device.save();
      return device;
    } catch (error) {
      throw new Error('Error updating IoT device: ' + error.message);
    }
  }
}

module.exports = new IotService();
