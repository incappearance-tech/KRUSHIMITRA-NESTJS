import { Controller, Post, Body, HttpCode, HttpStatus, Patch, UseGuards, Get, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto, UpdateProfileDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('otp/request')
    @ApiOperation({ summary: 'Request OTP for login/signup' })
    @ApiResponse({ status: 200, description: 'OTP sent successfully' })
    @HttpCode(HttpStatus.OK)
    async requestOtp(@Body() requestOtpDto: RequestOtpDto) {
        return this.authService.requestOtp(requestOtpDto.phoneNumber);
    }

    @Post('otp/verify')
    @ApiOperation({ summary: 'Verify OTP and return JWT token' })
    @ApiResponse({ status: 200, description: 'Login successful' })
    @HttpCode(HttpStatus.OK)
    async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
        return this.authService.verifyOtp(verifyOtpDto);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Logout user' })
    @ApiResponse({ status: 200, description: 'Logged out successfully' })
    @HttpCode(HttpStatus.OK)
    async logout(@GetUser('id') userId: string) {
        return this.authService.logout(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('profile')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Update user profile' })
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    async updateProfile(
        @GetUser('id') userId: string,
        @Body() updateProfileDto: UpdateProfileDto
    ) {
        return this.authService.updateProfile(userId, updateProfileDto);
    }

    @UseGuards(JwtAuthGuard)
    @UseInterceptors(CacheInterceptor) // Cache user profile for 5 minutes
    @HttpCode(HttpStatus.OK)
    @Get('me')
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get current user profile' })
    @ApiResponse({ status: 200, description: 'Returns user profile' })
    async getMe(@GetUser() user: any) {
        return {
            user,
            needsProfileSetup: user.role === 'GUEST',
        };
    }
}
