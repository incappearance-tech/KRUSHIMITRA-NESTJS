import { Controller, Post, Body, HttpCode, HttpStatus, Patch, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto, UpdateProfileDto } from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('otp/request')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Request a 6-digit OTP' })
    @ApiResponse({ status: 200, description: 'OTP sent successfully' })
    async requestOtp(@Body() requestOtpDto: RequestOtpDto) {
        return this.authService.requestOtp(requestOtpDto.phoneNumber);
    }

    @Post('otp/verify')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Verify OTP and get JWT token' })
    @ApiResponse({ status: 200, description: 'User verified and token returned' })
    @ApiResponse({ status: 401, description: 'Invalid OTP' })
    async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
        return this.authService.verifyOtp(verifyOtpDto);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @Patch('profile')
    @ApiOperation({ summary: 'Update user profile (Name, Role, Language)' })
    @ApiResponse({ status: 200, description: 'Profile updated successfully' })
    async updateProfile(
        @GetUser('id') userId: string,
        @Body() updateProfileDto: UpdateProfileDto
    ) {
        return this.authService.updateProfile(userId, updateProfileDto);
    }

    @UseGuards(JwtAuthGuard)
    @ApiBearerAuth()
    @HttpCode(HttpStatus.OK)
    @Get('me')
    @ApiOperation({ summary: 'Get current user profile status' })
    @ApiResponse({ status: 200, description: 'Return current user data' })
    async getMe(@GetUser() user: any) {
        return {
            user,
            needsProfileSetup: !user.name,
        };
    }
}
