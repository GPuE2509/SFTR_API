const SystemConfig = require('../../models/SystemConfig');

class ConfigController {
  async updateConfig(req, res) {
    try {
      const {
        water_level_l1,
        water_level_l2,
        water_level_l3,
        water_level_l4
      } = req.body;

      // Validation check: levels must be in ascending order
      if (water_level_l1 !== undefined && water_level_l2 !== undefined && water_level_l1 >= water_level_l2) {
        return res.status(400).json({ success: false, message: 'Level 1 must be less than Level 2' });
      }
      if (water_level_l2 !== undefined && water_level_l3 !== undefined && water_level_l2 >= water_level_l3) {
        return res.status(400).json({ success: false, message: 'Level 2 must be less than Level 3' });
      }
      if (water_level_l3 !== undefined && water_level_l4 !== undefined && water_level_l3 >= water_level_l4) {
        return res.status(400).json({ success: false, message: 'Level 3 must be less than Level 4' });
      }

      let config = await SystemConfig.findOne({ key: 'default' });
      if (!config) {
        config = new SystemConfig({ key: 'default' });
      }

      if (water_level_l1 !== undefined) config.water_level_l1 = water_level_l1;
      if (water_level_l2 !== undefined) config.water_level_l2 = water_level_l2;
      if (water_level_l3 !== undefined) config.water_level_l3 = water_level_l3;
      if (water_level_l4 !== undefined) config.water_level_l4 = water_level_l4;

      await config.save();

      // Recalculate warning_water_status for all devices based on the new config
      const IotDevice = require('../../models/IotDevice');
      const devices = await IotDevice.find({});
      for (const device of devices) {
        await device.save();
      }

      // Broadcast changes in real-time to all connected WebSocket clients
      const wss = req.app.get('wss');
      if (wss) {
        const payload = JSON.stringify({ type: 'system_config_changed', config });
        wss.clients.forEach(client => {
          if (client.readyState === 1) client.send(payload);
        });
      }

      res.status(200).json({
        success: true,
        data: config,
        message: 'System configuration updated successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new ConfigController();
