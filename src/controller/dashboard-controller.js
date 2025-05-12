import dashboardService from "../service/dashboard-service.js";


export const getOrderStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const totalOrders = await dashboardService.getOrderStats(filter);
    
    res.status(200).json({
      status: 'success',
      data: {
        totalOrders
      }
    });
  } catch (error) {
    next(error);
  }
};


export const getProductStats = async (req, res, next) => {
  try {
    const totalProducts = await dashboardService.getProductStats();
    
    res.status(200).json({
      status: 'success',
      data: {
        totalProducts
      }
    });
  } catch (error) {
    next(error);
  }
};


export const getRevenueStats = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    
    const filter = {};
    if (startDate && endDate) {
      filter.createdAt = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const totalRevenue = await dashboardService.getRevenueStats(filter);
    
    res.status(200).json({
      status: 'success',
      data: {
        totalRevenue
      }
    });
  } catch (error) {
    next(error);
  }
};


export const getUserStats = async (req, res, next) => {
  try {
    const totalUsers = await dashboardService.getUserStats();
    
    res.status(200).json({
      status: 'success',
      data: {
        totalUsers
      }
    });
  } catch (error) {
    next(error);
  }
};