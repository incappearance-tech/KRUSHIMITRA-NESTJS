import { Controller, Post, Body, HttpCode, HttpStatus, Patch, UseGuards, Get, UseInterceptors } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto, UpdateProfileDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { CacheInterceptor } from '../../common/interceptors/cache.interceptor';

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('otp/request')
    @HttpCode(HttpStatus.OK)
    async requestOtp(@Body() requestOtpDto: RequestOtpDto) {
        return this.authService.requestOtp(requestOtpDto.phoneNumber);
    }

    @Post('otp/verify')
    @HttpCode(HttpStatus.OK)
    async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
        return this.authService.verifyOtp(verifyOtpDto);
    }

    @UseGuards(JwtAuthGuard)
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(@GetUser('id') userId: string) {
        return this.authService.logout(userId);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('profile')
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
    async getMe(@GetUser() user: any) {
        return {
            user,
            needsProfileSetup: user.role === 'GUEST',
        };
    }
}
